import assert from "node:assert/strict";
import test from "node:test";

import { withParameterNames } from "./msg91";

test("named body slots get their parameter_name", () => {
  assert.deepEqual(
    withParameterNames({
      body_var_1: { type: "text", value: "Asha" },
      body_var_10: { type: "text", value: "Kochi" },
    }),
    {
      body_var_1: { type: "text", value: "Asha", parameter_name: "var_1" },
      body_var_10: { type: "text", value: "Kochi", parameter_name: "var_10" },
    },
  );
});

test("positional slots are left unchanged", () => {
  const components = { body_1: { type: "text", value: "Asha" } };
  assert.deepEqual(withParameterNames(components), components);
});
