import assert from "node:assert/strict";
import test from "node:test";

import { buildWelcomeComponents, welcomeRecipient } from "./welcome";

const details = {
  businessName: "Brides  of\nKhair",
  businessEmail: "shop@example.com",
  businessPhone: "98765 43210",
  ownerFirstName: "Asha",
  ownerLastName: "K",
  ownerEmail: "asha@example.com",
};

test("welcome fills the six template variables in order", () => {
  const components = buildWelcomeComponents(
    { details, planName: "Yearly", periodEnd: new Date("2027-11-20T00:00:00Z") },
    "https://app.example.com/",
  );

  assert.deepEqual(
    Object.keys(components),
    ["body_var_1", "body_var_2", "body_var_3", "body_var_4", "body_var_5", "body_var_6"],
  );
  assert.equal(components.body_var_1.value, "Asha");
  // No line breaks or double spaces reach Meta.
  assert.equal(components.body_var_2.value, "Brides of Khair");
  assert.equal(components.body_var_3.value, "Yearly");
  assert.match(components.body_var_4.value, /2027/);
  assert.equal(components.body_var_5.value, "asha@example.com");
  assert.equal(components.body_var_6.value, "https://app.example.com/login");
});

test("welcome goes to the owner's phone, else the business phone", () => {
  assert.equal(welcomeRecipient(details), "919876543210");
  assert.equal(
    welcomeRecipient({ ...details, ownerPhone: "+91 91234 56789" }),
    "919123456789",
  );
});
