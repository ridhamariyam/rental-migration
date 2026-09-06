"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BarcodeIcon, MoreHorizontalIcon, PencilIcon, ShirtIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { BarcodeDisplay } from "@/components/tenant/barcode-display";
import { EditVariationDialog } from "@/components/tenant/edit-variation-dialog";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { VariationListItem } from "@/server/variations/service";

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  maintenance: "Maintenance",
  retired: "Retired",
};

/** Only the three statuses this phase's UI can pick by hand — see
 * `variationStatusSchema`'s doc comment. */
const MANUAL_STATUSES = ["available", "maintenance", "retired"] as const;

export function VariationRow({
  variation,
  productName,
  outlets,
}: {
  variation: VariationListItem;
  productName: string;
  outlets: { id: string; name: string; code: string }[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const canPickStatus = MANUAL_STATUSES.includes(
    variation.status as (typeof MANUAL_STATUSES)[number],
  );

  const handleAvailabilityToggle = async () => {
    setIsTogglingAvailability(true);
    try {
      await apiRequest(`/api/variations/${variation.id}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ isAvailable: !variation.isAvailable }),
      });
      router.refresh();
    } catch {
      // A transient failure here just leaves the toggle unchanged — the
      // row's own badge is the source of truth, no separate error banner
      // needed for a single-field, instantly-retriable toggle.
    } finally {
      setIsTogglingAvailability(false);
    }
  };

  const handleStatusChange = async (status: string | null) => {
    if (!status) return;
    setIsChangingStatus(true);
    try {
      await apiRequest(`/api/variations/${variation.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } catch (error) {
      console.error(
        error instanceof ApiClientError
          ? error.message
          : "Status update failed",
      );
    } finally {
      setIsChangingStatus(false);
    }
  };

  return (
    <>
      <TableRow className="hover:bg-accent/40 transition-colors">
        <TableCell className="px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
              {variation.image ? (
                <Image
                  src={variation.image}
                  alt=""
                  width={40}
                  height={40}
                  className="size-full object-cover"
                  unoptimized
                />
              ) : (
                <ShirtIcon className="text-muted-foreground size-4" />
              )}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-sm text-foreground">
                {[variation.color, variation.size].filter(Boolean).join(" · ") ||
                  "—"}
              </span>
              <span className="text-muted-foreground/80 font-mono text-[11px]">
                {variation.sku}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground px-6 py-3.5 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{formatMoney(variation.rentPrice)} rent</span>
            <span className="text-xs text-muted-foreground/80">{formatMoney(variation.securityDeposit)} deposit</span>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground px-6 py-3.5 text-sm font-medium">
          {variation.outletName ?? "Unassigned"}
        </TableCell>
        <TableCell className="px-6 py-3.5">
          {variation.ownershipType === "customer_owned" ? (
            <div className="flex flex-col gap-1">
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 w-fit rounded-md font-medium">
                <span className="size-1.5 rounded-full bg-current mr-1" />
                Customer-owned
              </Badge>
              <span className="text-muted-foreground/80 text-xs font-medium">
                {variation.ownerName || "Unnamed owner"} · {variation.ownerSharePercentage}%
              </span>
            </div>
          ) : (
            <Badge variant="outline" className="text-muted-foreground w-fit rounded-md font-medium">
              Shop-owned
            </Badge>
          )}
        </TableCell>
        <TableCell className="px-6 py-3.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isTogglingAvailability}
            onClick={handleAvailabilityToggle}
            className="h-auto p-0 hover:bg-transparent"
          >
            {variation.isAvailable ? (
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary cursor-pointer rounded-md font-medium"
              >
                <span className="size-1.5 rounded-full bg-current mr-1" />
                Listed
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-muted-foreground cursor-pointer rounded-md font-medium"
              >
                <span className="size-1.5 rounded-full bg-current mr-1" />
                Unlisted
              </Badge>
            )}
          </Button>
        </TableCell>
        <TableCell className="px-6 py-3.5">
          {canPickStatus ? (
            <Select
              value={variation.status}
              onValueChange={handleStatusChange}
              disabled={isChangingStatus}
            >
              <SelectTrigger size="sm" className="w-34 h-9 text-xs rounded-lg">
                <SelectValue placeholder="Status">
                  {(value: string) => STATUS_LABELS[value] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {MANUAL_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="capitalize rounded-md">
              {variation.status.replace("_", " ")}
            </Badge>
          )}
        </TableCell>
        <TableCell className="px-6 py-3.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${variation.sku}`}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBarcodeOpen(true)}>
                <BarcodeIcon />
                Barcode
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <EditVariationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        variation={variation}
        outlets={outlets}
      />
      <BarcodeDisplay
        open={barcodeOpen}
        onOpenChange={setBarcodeOpen}
        sku={variation.sku}
        barcode={variation.barcode}
        productName={productName}
      />
    </>
  );
}
