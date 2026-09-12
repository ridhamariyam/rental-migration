"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Thin client island so the receipt page itself can stay a plain async
 * Server Component — `window.print()` needs to run in the browser. */
export function PrintReceiptButton({
  label = "Print invoice",
}: {
  /** What the button prints — the same control serves the customer
   * invoice and a staff payslip. */
  label?: string;
} = {}) {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <PrinterIcon />
      {label}
    </Button>
  );
}
