"use client";

import { useEffect, useRef, useState } from "react";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Renders a Code128 barcode client-side via `jsbarcode`, replacing the
 * legacy backend's server-side `generate_barcode_image` (a Python `barcode`
 * library writing a PNG to disk) — the SVG is generated on demand from the
 * stored `barcode` string itself, so there's no image file to keep in sync
 * with the record and nothing to clean up if the item is ever removed.
 *
 * The human-readable text under the bars must be the *encoded* value
 * itself (`value`) — SKU and barcode are two different identifiers on the
 * same row (see `product-variations.ts`), and printing the SKU here would
 * mean the printed label doesn't match what a scanner (or a manual
 * fallback typed from the label) actually reads, which is exactly the
 * confusion this caused at pickup/return's barcode-scan check.
 */
function BarcodeSvg({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    let cancelled = false;

    import("jsbarcode").then(({ default: JsBarcode }) => {
      if (cancelled || !svgRef.current) return;
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        height: 60,
        margin: 10,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [value]);

  return <svg ref={svgRef} className="w-full" />;
}

export function BarcodeDisplay({
  open,
  onOpenChange,
  sku,
  barcode,
  productName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: string;
  barcode: string;
  productName: string;
}) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = () => {
    setPrinting(true);
    // Give the dialog a tick to settle before the browser's print dialog
    // takes over — `window.print()` only captures what's already painted.
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>Barcode label</DialogTitle>
          <DialogDescription>
            {productName} — {sku}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 rounded-lg border p-6">
          <p className="text-sm font-medium">{productName}</p>
          <BarcodeSvg value={barcode} />
          <p className="text-muted-foreground text-xs">SKU {sku}</p>
        </div>

        <Button
          type="button"
          onClick={handlePrint}
          disabled={printing}
          className="print:hidden"
        >
          <PrinterIcon />
          Print label
        </Button>
      </DialogContent>
    </Dialog>
  );
}
