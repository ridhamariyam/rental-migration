"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  BarcodeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ShirtIcon,
  Trash2Icon,
} from "lucide-react";

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
import { DeleteVariationDialog } from "@/components/tenant/delete-variation-dialog";
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

/**
 * One physical item, in either of two shapes: a row of the eight-column
 * table (`layout="table"`, from `sm` up) or a stacked card (`layout="card"`,
 * on a phone). Both are rendered from this one component rather than two,
 * so the availability toggle, status change, edit and barcode actions have
 * a single implementation — only their arrangement differs.
 */
export function VariationRow({
  variation,
  productName,
  outlets,
  canViewCost,
  canDelete = false,
  layout = "table",
}: {
  variation: VariationListItem;
  productName: string;
  outlets: { id: string; name: string; code: string }[];
  canViewCost: boolean;
  /** Owner-only (`Permission.RECORD_DELETE`). */
  canDelete?: boolean;
  layout?: "table" | "card";
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  const identity = (
    <div className="flex min-w-0 items-center gap-3">
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
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-foreground truncate text-sm font-semibold">
          {[variation.color, variation.size].filter(Boolean).join(" · ") || "—"}
        </span>
        <span className="text-muted-foreground/80 truncate font-mono text-[11px]">
          {variation.sku}
        </span>
      </div>
    </div>
  );

  const pricing = (
    <div className="flex flex-col gap-0.5">
      <span className="text-foreground font-medium">
        {formatMoney(variation.rentPrice)} rent
      </span>
      {variation.sellingPrice ? (
        <span className="text-muted-foreground/80 text-xs">
          {formatMoney(variation.sellingPrice)} selling
        </span>
      ) : null}
      {canViewCost && variation.buyingPrice ? (
        <span className="text-muted-foreground/80 text-xs">
          {formatMoney(variation.buyingPrice)} buying
        </span>
      ) : null}
    </div>
  );

  const ownership =
    variation.ownershipType === "customer_owned" ? (
      <div className="flex flex-col gap-1">
        <Badge
          variant="secondary"
          className="w-fit rounded-md bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400"
        >
          <span className="mr-1 size-1.5 rounded-full bg-current" />
          Customer-owned
        </Badge>
        <span className="text-muted-foreground/80 text-xs font-medium">
          {variation.ownerName || "Unnamed owner"} ·{" "}
          {formatMoney(variation.ownerShareAmount)}
        </span>
      </div>
    ) : (
      <Badge
        variant="outline"
        className="text-muted-foreground w-fit rounded-md font-medium"
      >
        Shop-owned
      </Badge>
    );

  const availabilityToggle = (
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
          <span className="mr-1 size-1.5 rounded-full bg-current" />
          Listed
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="text-muted-foreground cursor-pointer rounded-md font-medium"
        >
          <span className="mr-1 size-1.5 rounded-full bg-current" />
          Unlisted
        </Badge>
      )}
    </Button>
  );

  const statusControl = canPickStatus ? (
    <Select
      value={variation.status}
      onValueChange={handleStatusChange}
      disabled={isChangingStatus}
    >
      <SelectTrigger size="sm" className="h-9 w-32 rounded-lg text-xs">
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
    <Badge variant="outline" className="rounded-md capitalize">
      {variation.status.replace("_", " ")}
    </Badge>
  );

  const actionsMenu = (
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
        {canDelete ? (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const dialogs = (
    <>
      <EditVariationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        variation={variation}
        outlets={outlets}
        canViewCost={canViewCost}
      />
      <DeleteVariationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        variation={variation}
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

  if (layout === "card") {
    return (
      <li className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{identity}</div>
          <div className="shrink-0">{actionsMenu}</div>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {pricing}
          <span aria-hidden="true">·</span>
          <span>Qty {variation.quantity}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">
            {variation.outletName ?? "Unassigned"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {availabilityToggle}
          {statusControl}
          {ownership}
        </div>

        {dialogs}
      </li>
    );
  }

  return (
    <>
      <TableRow className="hover:bg-accent/40 transition-colors">
        <TableCell className="px-4 py-3.5">{identity}</TableCell>
        <TableCell className="text-muted-foreground px-4 py-3.5 text-sm">
          {pricing}
        </TableCell>
        <TableCell className="text-muted-foreground px-4 py-3.5 text-sm font-medium">
          {variation.quantity}
        </TableCell>
        <TableCell className="text-muted-foreground px-4 py-3.5 text-sm font-medium">
          {variation.outletName ?? "Unassigned"}
        </TableCell>
        <TableCell className="px-4 py-3.5">{ownership}</TableCell>
        <TableCell className="px-4 py-3.5">{availabilityToggle}</TableCell>
        <TableCell className="px-4 py-3.5">{statusControl}</TableCell>
        <TableCell className="px-4 py-3.5">{actionsMenu}</TableCell>
      </TableRow>

      {dialogs}
    </>
  );
}
