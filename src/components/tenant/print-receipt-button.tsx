"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Thin client island so the receipt page itself can stay a plain async
 * Server Component — `window.print()` needs to run in the browser. */
export function PrintReceiptButton() {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <PrinterIcon />
      Print invoice
    </Button>
  );
}
