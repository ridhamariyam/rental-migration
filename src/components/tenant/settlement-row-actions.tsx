"use client";

import { useState } from "react";
import { HandCoinsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkSettlementPaidDialog } from "@/components/tenant/mark-settlement-paid-dialog";

export function SettlementRowActions({
  settlementId,
  ownerName,
  ownerAmount,
}: {
  settlementId: string;
  ownerName: string | null;
  ownerAmount: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <HandCoinsIcon />
        Mark paid
      </Button>
      <MarkSettlementPaidDialog
        open={open}
        onOpenChange={setOpen}
        settlementId={settlementId}
        ownerName={ownerName}
        ownerAmount={ownerAmount}
      />
    </>
  );
}
