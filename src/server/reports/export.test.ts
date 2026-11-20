import assert from "node:assert/strict";
import test from "node:test";

import { toCsv } from "./export";

test("CSV quotes commas/quotes and neutralises formulas", () => {
  const csv = toCsv({
    header: ["Name", "Amount"],
    rows: [
      ['Asha, "K"', "1500.00"],
      ["=HYPERLINK(1)", -20],
      [null, "-5.00"],
    ],
  });
  assert.equal(
    csv,
    '﻿Name,Amount\r\n"Asha, ""K""",1500.00\r\n\'=HYPERLINK(1),-20\r\n,-5.00\r\n',
  );
});

test("every report type builds a table", async () => {
  const { resetDatabase, seedShop } = await import("@/test/db");
  const { REPORT_TYPES } = await import("@/lib/report-types");
  const { buildReportTable } = await import("./export");
  await resetDatabase();
  const fixture = await seedShop();

  for (const { value } of REPORT_TYPES) {
    const table = await buildReportTable(fixture.admin, value, { year: "2030" });
    assert.ok(table.header.length > 0, value);
  }
});
