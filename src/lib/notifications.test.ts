import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTemplateComponents,
  normalizeWhatsAppPhone,
  notificationRuleBlocker,
} from "@/lib/notifications";

test("normalizes a 10 digit Indian WhatsApp number with the default country code", () => {
  assert.equal(normalizeWhatsAppPhone("98765 43210"), "919876543210");
});

test("keeps an already country-coded WhatsApp number", () => {
  assert.equal(normalizeWhatsAppPhone("+1 (415) 555-0100", "91"), "14155550100");
});

test("rejects clearly invalid WhatsApp numbers", () => {
  assert.throws(() => normalizeWhatsAppPhone("12345"), /at least 10 digits/);
});

test("maps configured template component slots from notification context", () => {
  assert.deepEqual(
    buildTemplateComponents(
      { body_1: "customer_name", body_2: "booking_number", body_3: "missing" },
      { customer_name: "Ridha", booking_number: "BK-001" },
    ),
    {
      body_1: { type: "text", value: "Ridha" },
      body_2: { type: "text", value: "BK-001" },
    },
  );
});

test("rule blocker: a switched-off rule is never reported", () => {
  const rule = { isEnabled: false, whatsappNumberId: null, templateId: null };
  assert.equal(
    notificationRuleBlocker(rule, { hasNumber: false, templateStatus: null }),
    null,
  );
});

test("rule blocker: names what an enabled rule is missing", () => {
  const on = { isEnabled: true, whatsappNumberId: "n1", templateId: "t1" };
  assert.equal(
    notificationRuleBlocker(
      { ...on, whatsappNumberId: null },
      { hasNumber: false, templateStatus: "APPROVED" },
    ),
    "no WhatsApp number picked",
  );
  assert.equal(
    notificationRuleBlocker(
      { ...on, templateId: null },
      { hasNumber: true, templateStatus: null },
    ),
    "no template picked",
  );
  assert.match(
    notificationRuleBlocker(on, { hasNumber: true, templateStatus: "PENDING" }) ?? "",
    /pending/,
  );
  assert.equal(
    notificationRuleBlocker(on, { hasNumber: true, templateStatus: "APPROVED" }),
    null,
  );
});
