"use client";

import { useState } from "react";
import { PlusIcon, ShirtIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddVariationDialog } from "@/components/tenant/add-variation-dialog";
import { VariationRow } from "@/components/tenant/variation-row";
import type { VariationListItem } from "@/server/variations/service";

export function VariationsCard({
  productId,
  productName,
  variations,
  outlets,
  canManage,
  canViewCost,
}: {
  productId: string;
  productName: string;
  variations: VariationListItem[];
  outlets: { id: string; name: string; code: string }[];
  canManage: boolean;
  canViewCost: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 px-6 py-5 border-b border-border/60">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-base font-semibold tracking-tight">
            Physical items
          </CardTitle>
          <p className="text-muted-foreground/90 text-sm">
            Each barcoded copy of this product.
          </p>
        </div>
        {canManage && outlets.length > 0 ? (
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 font-medium shadow-2xs">
            <PlusIcon className="size-4" />
            Add item
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {variations.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShirtIcon />
              </EmptyMedia>
              <EmptyTitle>No physical items yet</EmptyTitle>
              <EmptyDescription>
                {outlets.length === 0
                  ? "Add an active outlet before adding barcoded stock."
                  : "Add your first barcoded item to make this product bookable."}
              </EmptyDescription>
            </EmptyHeader>
            {canManage && outlets.length > 0 ? (
              <EmptyContent>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <PlusIcon />
                  Add item
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/20 border-b border-border/60">
                <TableHead className="text-muted-foreground/80 h-10 px-6 text-xs font-semibold tracking-wider uppercase">
                  Item
                </TableHead>
                <TableHead className="text-muted-foreground/80 h-10 px-6 text-xs font-semibold tracking-wider uppercase">
                  Pricing
                </TableHead>
                <TableHead className="text-muted-foreground/80 h-10 px-6 text-xs font-semibold tracking-wider uppercase">
                  Stock
                </TableHead>
                <TableHead className="text-muted-foreground/80 h-10 px-6 text-xs font-semibold tracking-wider uppercase">
                  Outlet
                </TableHead>
                <TableHead className="text-muted-foreground/80 h-10 px-6 text-xs font-semibold tracking-wider uppercase">
                  Ownership
                </TableHead>
                <TableHead className="text-muted-foreground/80 h-10 px-6 text-xs font-semibold tracking-wider uppercase">
                  Listing
                </TableHead>
                <TableHead className="text-muted-foreground/80 h-10 px-6 text-xs font-semibold tracking-wider uppercase">
                  Status
                </TableHead>
                <TableHead className="w-12 px-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variations.map((variation) => (
                <VariationRow
                  key={variation.id}
                  variation={variation}
                  productName={productName}
                  outlets={outlets}
                  canViewCost={canViewCost}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AddVariationDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        productId={productId}
        outlets={outlets}
        canViewCost={canViewCost}
      />
    </Card>
  );
}
