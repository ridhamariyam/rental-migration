/**
 * A template MSG91 no longer reports as approved must stop being used.
 *
 * `booking_confirmed` was edited on MSG91 and went back to Meta review.
 * Template sync only asked MSG91 for approved templates, and read MSG91's
 * per-language status as missing (defaulting it to "approved"), so the
 * stored copy stayed "approved". Every confirmation was then sent to a
 * template Meta rejected asynchronously with "template name
 * (booking_confirmed) does not exist in en" — while the log said "sent".
 */
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db, resetDatabase, seedShop, seedVariation, type Fixture } from "@/test/db";
import {
  notificationLogs,
  notificationRules,
  whatsappNumbers,
  whatsappTemplates,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createBooking } from "@/server/bookings/service";
import {
  ensureDefaultNotificationRules,
  syncWhatsappTemplates,
} from "@/server/notifications/service";

const realFetch = globalThis.fetch;
const realAuthkey = env.MSG91_AUTHKEY;

afterEach(() => {
  globalThis.fetch = realFetch;
  env.MSG91_AUTHKEY = realAuthkey;
});

/** The shape MSG91's `get-template-client` actually returns: status,
 * variables and body nested per language. */
function msg91Template(name: string, status: string, variables: string[]) {
  return {
    name,
    category: "UTILITY",
    namespace: "test_namespace",
    languages: [
      {
        name,
        language: "en",
        status,
        parameter_format: "NAMED",
        variables,
        code: [{ type: "BODY", text: "Hello {{var_1}}" }],
      },
    ],
  };
}

function stubMsg91Templates(templates: unknown[]): void {
  env.MSG91_AUTHKEY = "test-authkey";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ status: "success", data: templates }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

/** A shop whose `booking_confirmed` rule points at a stored, approved
 * `booking_confirmed` template — the state production was in. */
async function wireShop() {
  const fixture = await seedShop();
  await ensureDefaultNotificationRules(fixture.shopId);

  const [number] = await db
    .insert(whatsappNumbers)
    .values({
      shopId: fixture.shopId,
      integratedNumber: "919876543210",
      isDefault: true,
    })
    .returning();

  const [template] = await db
    .insert(whatsappTemplates)
    .values({
      shopId: fixture.shopId,
      whatsappNumberId: number.id,
      integratedNumber: number.integratedNumber,
      name: "booking_confirmed",
      language: "en",
      status: "approved",
    })
    .returning();

  await db
    .update(notificationRules)
    .set({ whatsappNumberId: number.id, templateId: template.id, isEnabled: true })
    .where(
      and(
        eq(notificationRules.shopId, fixture.shopId),
        eq(notificationRules.event, "booking_confirmed"),
      ),
    );

  return { fixture, number };
}

async function storedTemplate(shopId: string, name: string) {
  const [row] = await db
    .select()
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.shopId, shopId), eq(whatsappTemplates.name, name)));
  return row;
}

async function confirmationsFor(bookingId: string): Promise<number> {
  const rows = await db
    .select({ id: notificationLogs.id })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.bookingId, bookingId),
        eq(notificationLogs.event, "booking_confirmed"),
      ),
    );
  return rows.length;
}

async function bookWithAdvance(fixture: Fixture, variationId: string) {
  return createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [
      {
        variationId,
        fromDate: "2030-11-01",
        toDate: "2030-11-03",
        quantity: "1",
      },
    ],
    advanceAmount: "500.00",
    advancePaymentMethod: "cash",
  } as Parameters<typeof createBooking>[1]);
}

const CONFIRMED_VARS = ["body_var_1", "body_var_2", "body_var_3", "body_var_4", "body_var_5"];

test("a template back in Meta review syncs as pending and stops confirmations, then resumes once approved", async () => {
  await resetDatabase();
  const { fixture, number } = await wireShop();
  const variation = await seedVariation(fixture, { quantity: 2 });

  stubMsg91Templates([
    msg91Template("booking_confirmed", "pending", CONFIRMED_VARS),
    msg91Template("return_reminder", "approved", ["body_var_1"]),
  ]);
  await syncWhatsappTemplates(fixture.shopId, number.id);

  assert.equal((await storedTemplate(fixture.shopId, "booking_confirmed")).status, "pending");
  const reminder = await storedTemplate(fixture.shopId, "return_reminder");
  assert.equal(reminder.status, "approved");
  assert.deepEqual(reminder.variableSlots, ["body_var_1"]);
  assert.equal(reminder.body, "Hello {{var_1}}");

  const whileInReview = await bookWithAdvance(fixture, variation.id);
  assert.equal(whileInReview.booking.status, "confirmed");
  assert.equal(
    await confirmationsFor(whileInReview.booking.id),
    0,
    "a pending template must not be used to send",
  );

  stubMsg91Templates([msg91Template("booking_confirmed", "approved", CONFIRMED_VARS)]);
  await syncWhatsappTemplates(fixture.shopId, number.id);

  const afterApproval = await bookWithAdvance(fixture, variation.id);
  assert.equal(
    await confirmationsFor(afterApproval.booking.id),
    1,
    "re-approval and a sync are enough — the rule does not need re-saving",
  );
});

test("a template MSG91 no longer lists is no longer sendable", async () => {
  await resetDatabase();
  const { fixture, number } = await wireShop();

  stubMsg91Templates([msg91Template("return_reminder", "approved", ["body_var_1"])]);
  await syncWhatsappTemplates(fixture.shopId, number.id);

  assert.equal(
    (await storedTemplate(fixture.shopId, "booking_confirmed")).status,
    "not_returned_by_msg91",
  );
});

test("an empty template list from MSG91 leaves stored templates alone", async () => {
  await resetDatabase();
  const { fixture, number } = await wireShop();

  stubMsg91Templates([]);
  await syncWhatsappTemplates(fixture.shopId, number.id);

  assert.equal((await storedTemplate(fixture.shopId, "booking_confirmed")).status, "approved");
});
