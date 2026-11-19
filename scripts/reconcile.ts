/**
 * Read-only money reconciliation. Recomputes every stored amount from its
 * source rows with the app's own formulas and lists anything that doesn't
 * tie out — it never writes (the whole run is one READ ONLY transaction).
 *
 * Checks, per tenant:
 *  - order total_amount  == Σ gross_rent (non-cancelled items) − capped discount + additional cost
 *  - item gross_rent     == rent_amount × quantity
 *  - order payment_status == computePaymentSummary(...).status (the ledger)
 *  - deposit ledger: never more released/applied than was collected
 *  - payment rows: positive amounts, same tenant as their order
 *  - owner settlements: owner_amount + shop_amount == gross_rental_amount
 *  - dashboard "cash collected" (today / this month) == Σ inflow payments,
 *    on both the UTC and the India (IST) calendar day
 * Platform billing:
 *  - amount == plan fee + setup fee; online purchases priced at the plan's list price
 *  - every paid payment has paid_at + a period; online ones a Razorpay payment id
 *  - each shop's subscription_ends_at == its latest paid period_end
 *
 * Usage:
 *   pnpm exec tsx --conditions=react-server --env-file=.env.local scripts/reconcile.ts
 */
import postgres from "postgres";
import { computePaymentSummary } from "../src/server/payments/service";
import { addMoney, compareMoney, subtractMoneyNonNegative } from "../src/lib/money";
import { PLANS, isPlanId } from "../src/lib/plans";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, onnotice: () => {} });

type Issue = { area: string; shop: string; ref: string; detail: string };
const issues: Issue[] = [];
const info: string[] = [];
const flag = (area: string, shop: string, ref: string, detail: string) =>
  issues.push({ area, shop, ref, detail });
const ZERO = "0.00";
const m = (v: unknown) => (v === null || v === undefined ? ZERO : String(v));

async function main() {
  await sql.begin("isolation level repeatable read read only", async (tx) => {
    const shops = await tx`select id, name, plan, subscription_ends_at, is_demo from shops order by created_at`;

    for (const shop of shops) {
      const label = shop.is_demo ? `${shop.name} (demo)` : shop.name;

      const orders = await tx`select id, booking_number, status, discount_amount, additional_cost,
        total_amount, security_deposit, payment_status from bookings where shop_id = ${shop.id}`;
      const items = await tx`select id, booking_id, status, rent_amount, quantity, gross_rent,
        damage_charge from booking_items where shop_id = ${shop.id}`;
      const pays = await tx`select p.id, p.booking_id, p.shop_id, p.payment_type, p.amount, b.shop_id as order_shop
        from payments p left join bookings b on b.id = p.booking_id where p.shop_id = ${shop.id}`;

      const itemsByOrder = new Map<string, typeof items>();
      for (const it of items) {
        (itemsByOrder.get(it.booking_id) ?? itemsByOrder.set(it.booking_id, [] as never).get(it.booking_id)!).push(it);
        // gross_rent == rent_amount × quantity
        const expected = (Number(it.rent_amount) * Number(it.quantity)).toFixed(2);
        if (compareMoney(m(it.gross_rent), expected) !== 0) {
          flag("item gross rent", label, it.id, `gross_rent ${it.gross_rent} ≠ rent ${it.rent_amount} × qty ${it.quantity}`);
        }
      }
      const paysByOrder = new Map<string, typeof pays>();
      for (const p of pays) {
        (paysByOrder.get(p.booking_id) ?? paysByOrder.set(p.booking_id, [] as never).get(p.booking_id)!).push(p);
        if (Number(p.amount) <= 0) flag("payment row", label, p.id, `non-positive amount ${p.amount}`);
        if (p.order_shop && p.order_shop !== p.shop_id) flag("payment row", label, p.id, "belongs to another tenant's order");
      }

      let statusMismatch = 0;
      for (const o of orders) {
        const its = itemsByOrder.get(o.id) ?? [];
        const active = its.filter((i) => i.status !== "cancelled");
        const gross = active.reduce((s, i) => addMoney(s, m(i.gross_rent)), ZERO);
        const discount = compareMoney(m(o.discount_amount), gross) > 0 ? gross : m(o.discount_amount);
        const expectedTotal = addMoney(subtractMoneyNonNegative(gross, discount), m(o.additional_cost));
        if (o.status !== "cancelled" && compareMoney(m(o.total_amount), expectedTotal) !== 0) {
          flag("order total", label, o.booking_number, `total ${o.total_amount} ≠ items ${gross} − discount ${discount} + extra ${o.additional_cost} = ${expectedTotal}`);
        }

        const damage = its.reduce((s, i) => addMoney(s, m(i.damage_charge)), ZERO);
        const rows = (paysByOrder.get(o.id) ?? []).map((p) => ({ paymentType: p.payment_type, amount: m(p.amount) }));
        const summary = computePaymentSummary(
          { totalAmount: m(o.total_amount), securityDeposit: m(o.security_deposit) },
          damage,
          rows,
        );
        if (summary.status !== o.payment_status) {
          statusMismatch += 1;
          if (statusMismatch <= 5) {
            flag("payment status", label, o.booking_number, `stored "${o.payment_status}" but ledger says "${summary.status}" (payable ${summary.totalReceivable}, collected rent ${summary.rentCollected} + deposit ${summary.depositCollected}, outstanding ${summary.outstanding})`);
          }
        }
        const depIn = rows.filter((r) => r.paymentType === "security_deposit").reduce((s, r) => addMoney(s, r.amount), ZERO);
        const depOut = rows.filter((r) => r.paymentType === "deposit_release" || r.paymentType === "deposit_applied").reduce((s, r) => addMoney(s, r.amount), ZERO);
        if (compareMoney(depOut, depIn) > 0) flag("deposit ledger", label, o.booking_number, `released/applied ${depOut} > collected ${depIn}`);
      }
      if (statusMismatch > 5) flag("payment status", label, "…", `${statusMismatch - 5} more orders with the same problem`);

      const settlements = await tx`select id, gross_rental_amount, owner_amount, shop_amount, status, paid_at
        from owner_settlements where shop_id = ${shop.id}`;
      for (const s of settlements) {
        if (compareMoney(addMoney(m(s.owner_amount), m(s.shop_amount)), m(s.gross_rental_amount)) !== 0) {
          flag("settlement split", label, s.id, `owner ${s.owner_amount} + shop ${s.shop_amount} ≠ gross ${s.gross_rental_amount}`);
        }
        if (s.status === "paid" && !s.paid_at) flag("settlement", label, s.id, "marked paid without a paid date");
      }

      // Dashboard cash: same inflow types the dashboard sums.
      const [cash] = await tx`select
          coalesce(sum(amount) filter (where payment_type <> 'refund' and created_at::date = current_date), 0)::text as today_utc,
          coalesce(sum(amount) filter (where payment_type <> 'refund' and (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date), 0)::text as today_ist,
          coalesce(sum(amount) filter (where payment_type <> 'refund' and date_trunc('month', created_at) = date_trunc('month', now())), 0)::text as month_utc,
          coalesce(sum(amount) filter (where payment_type <> 'refund' and date_trunc('month', created_at at time zone 'Asia/Kolkata') = date_trunc('month', now() at time zone 'Asia/Kolkata')), 0)::text as month_ist,
          count(*) filter (where payment_type = 'damage_charge')::int as legacy_damage_rows,
          coalesce(sum(amount) filter (where payment_type = 'refund'), 0)::text as refunds
        from payments where shop_id = ${shop.id} and payment_type in ('advance','balance','damage_charge','refund')`;
      info.push(
        `${label}: ${orders.length} orders, ${pays.length} payments, ${settlements.length} settlements · cash today UTC ₹${cash.today_utc} / IST ₹${cash.today_ist} · this month UTC ₹${cash.month_utc} / IST ₹${cash.month_ist} · refunds ₹${cash.refunds} · legacy damage_charge rows ${cash.legacy_damage_rows}`,
      );
    }

    // ---- Platform billing ----
    // Every list price ever in force: the code defaults, the saved
    // plan_prices rows, and both sides of each logged price change.
    const knownPrices = {
      yearly: { fees: new Set([PLANS.yearly.price * 100]), setupFees: new Set([PLANS.yearly.setupFee * 100]) },
      monthly: { fees: new Set([PLANS.monthly.price * 100]), setupFees: new Set([PLANS.monthly.setupFee * 100]) },
    };
    const addKnown = (plan: string, price: unknown, setupFee: unknown) => {
      if (!isPlanId(plan)) return;
      if (typeof price === "number") knownPrices[plan].fees.add(price * 100);
      if (typeof setupFee === "number") knownPrices[plan].setupFees.add(setupFee * 100);
    };
    const [{ exists: hasPlanPrices }] = await tx`select to_regclass('public.plan_prices') is not null as exists`;
    if (hasPlanPrices) {
      for (const r of await tx`select plan, price, setup_fee from plan_prices`) addKnown(r.plan, r.price, r.setup_fee);
    }
    for (const r of await tx`select before_state, after_state from audit_logs where action = 'platform.plan_prices_changed'`) {
      for (const state of [r.before_state, r.after_state] as (Record<string, { price?: number; setupFee?: number }> | null)[]) {
        for (const [plan, v] of Object.entries(state ?? {})) addKnown(plan, v?.price, v?.setupFee);
      }
    }

    const subs = await tx`select id, shop_id, purpose, plan, status, plan_fee_paise, setup_fee_paise, amount_paise,
      razorpay_order_id, razorpay_payment_id, paid_at, period_start, period_end, needs_attention from subscription_payments`;
    for (const p of subs) {
      if (p.amount_paise !== p.plan_fee_paise + p.setup_fee_paise) {
        flag("billing amount", "platform", p.id, `amount ${p.amount_paise} ≠ plan ${p.plan_fee_paise} + setup ${p.setup_fee_paise}`);
      }
      const online = Boolean(p.razorpay_order_id);
      if (online && isPlanId(p.plan)) {
        // Prices are editable, so an old charge is checked against every
        // price that has ever been in force, not just today's.
        const known = knownPrices[p.plan];
        if (!known.fees.has(p.plan_fee_paise)) {
          flag("billing price", "platform", p.id, `plan fee ${p.plan_fee_paise} paise was never a ${p.plan} list price (${[...known.fees].join(", ")})`);
        }
        if (p.purpose === "renewal" && p.setup_fee_paise !== 0) {
          flag("billing price", "platform", p.id, `renewal charged a setup fee of ${p.setup_fee_paise} paise`);
        }
        if (p.purpose === "signup" && !known.setupFees.has(p.setup_fee_paise)) {
          flag("billing price", "platform", p.id, `setup fee ${p.setup_fee_paise} paise was never a list setup fee (${[...known.setupFees].join(", ")})`);
        }
      }
      if (p.status === "paid") {
        if (!p.paid_at || !p.period_start || !p.period_end) {
          if (!p.needs_attention) flag("billing record", "platform", p.id, "paid but missing paid_at / period");
        }
        if (online && !p.razorpay_payment_id) flag("billing record", "platform", p.id, "online payment marked paid without a Razorpay payment id");
        if (!p.shop_id && !p.needs_attention) flag("billing record", "platform", p.id, "paid but not linked to a business");
      }
    }
    const ends = await tx`select s.name, s.subscription_ends_at, max(p.period_end) as last_paid_end, count(p.id)::int as paid
      from shops s left join subscription_payments p on p.shop_id = s.id and p.status = 'paid'
      group by s.id, s.name, s.subscription_ends_at`;
    for (const e of ends) {
      if (e.paid > 0 && String(e.subscription_ends_at) !== String(e.last_paid_end)) {
        flag("subscription end", e.name, "-", `ends ${e.subscription_ends_at?.toISOString?.() ?? e.subscription_ends_at} but latest paid period ends ${e.last_paid_end?.toISOString?.() ?? e.last_paid_end} (expected only after a manual plan edit)`);
      }
    }
    info.push(`Platform: ${subs.length} subscription payments (${subs.filter((s) => s.status === "paid").length} paid)`);
  });

  console.log("== Summary ==");
  for (const line of info) console.log(" ", line);
  console.log(`\n== ${issues.length} issue(s) ==`);
  for (const i of issues) console.log(`  [${i.area}] ${i.shop} · ${i.ref}: ${i.detail}`);
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
