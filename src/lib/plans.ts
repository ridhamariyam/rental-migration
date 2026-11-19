/**
 * The platform's own subscription plans — what a rental business pays the
 * platform owner (super admin) to use Rentque. Plain module (no
 * `server-only`) so the public pricing page, the signup form and the server
 * all read the exact same numbers: the amount a customer sees is the amount
 * the server charges.
 *
 * Amounts are whole rupees here; the payment gateway works in paise, see
 * `toPaise`.
 */
export const PLAN_IDS = ["yearly", "monthly"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Plan = {
  id: PlanId;
  name: string;
  /** Recurring plan price, in rupees, per billing period. */
  price: number;
  /** One-time onboarding fee, charged only with the first payment. */
  setupFee: number;
  /** Length of one billing period, in months. */
  periodMonths: number;
  periodLabel: string;
  tagline: string;
};

export const PLANS: Record<PlanId, Plan> = {
  yearly: {
    id: "yearly",
    name: "Yearly",
    price: 9990,
    setupFee: 500,
    periodMonths: 12,
    periodLabel: "year",
    tagline: "Best value — about ₹833 a month.",
  },
  monthly: {
    id: "monthly",
    name: "Monthly",
    price: 800,
    setupFee: 500,
    periodMonths: 1,
    periodLabel: "month",
    tagline: "Pay as you go, renew every month.",
  },
};

/** Everything included in both standard plans. */
export const PLAN_FEATURES = [
  "Unlimited products, variations & barcodes",
  "Bookings, availability, pickup & return",
  "Customers, payments & deposit settlement",
  "Multiple outlets & staff with roles",
  "GPS attendance, leave & salary/payslips",
  "Cleaning & maintenance tracking",
  "WhatsApp notifications & reminders",
  "Revenue, income & inventory reports",
];

/** What a custom plan can add on top — sold over WhatsApp, not online. */
export const CUSTOM_PLAN_FEATURES = [
  "Online payment collection from your customers",
  "AI features",
  "Custom reports",
  "Third-party integrations",
  "Any other feature your business needs",
];

/** Sales WhatsApp number, digits only with country code (wa.me format). */
export const SALES_WHATSAPP_NUMBER = "919037206737";

export function whatsappLink(message: string): string {
  return `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const CUSTOM_PLAN_WHATSAPP_MESSAGE =
  "Hi, I'm interested in a custom Rentque plan (online payments / AI features / custom reports / integrations). Please share the details.";

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

/** First payment: one period of the plan plus the one-time setup fee. */
export function signupTotal(plan: Plan): number {
  return plan.price + plan.setupFee;
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatRupees(rupees: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

export function formatPaise(paise: number): string {
  return formatRupees(paise / 100);
}

/** `from` + N calendar months (clamped to the target month's last day). */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

/**
 * After a subscription's paid period ends the business keeps full access
 * for this many days (renewal reminders show throughout), then the
 * dashboard locks until it is renewed.
 */
export const SUBSCRIPTION_GRACE_DAYS = 7;

/** Reminder banner appears this many days before the period ends. */
export const SUBSCRIPTION_REMINDER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionState =
  | "none" // no end date — legacy/manually provisioned tenant, never locks
  | "active"
  | "expiring" // within the reminder window
  | "grace" // past the end date, still inside the grace period
  | "locked";

export function subscriptionState(
  endsAt: Date | null,
  now: Date = new Date(),
): SubscriptionState {
  if (!endsAt) return "none";
  const remaining = endsAt.getTime() - now.getTime();
  if (remaining > SUBSCRIPTION_REMINDER_DAYS * DAY_MS) return "active";
  if (remaining > 0) return "expiring";
  if (remaining > -SUBSCRIPTION_GRACE_DAYS * DAY_MS) return "grace";
  return "locked";
}

export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}
