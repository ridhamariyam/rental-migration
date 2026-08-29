"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcwIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { leaveStatusLabel } from "@/components/tenant/leave-status-badge";
import {
  avatarGradient,
  initialsFor,
  staffAvatarSrc,
} from "@/lib/tenant-avatar";
import type { StaffLeave } from "@/lib/db/schema";

const STATUS_VALUES: (StaffLeave["status"] | "all")[] = [
  "all",
  "pending",
  "approved",
  "rejected",
];

const STATUS_LABELS: Record<string, string> = {
  all: "All statuses",
  ...Object.fromEntries(
    STATUS_VALUES.filter((v) => v !== "all").map((v) => [
      v,
      leaveStatusLabel(v as StaffLeave["status"]),
    ]),
  ),
};

export function LeaveFilters({
  defaultStatus,
  defaultStaffId,
  staffOptions,
}: {
  defaultStatus: string;
  defaultStaffId: string;
  staffOptions: { id: string; firstName: string; lastName: string }[] | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  const staffLabels: Record<string, string> = {
    all: "All staff",
    ...Object.fromEntries(
      (staffOptions ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]),
    ),
  };

  const activeFilterCount =
    (defaultStatus !== "all" ? 1 : 0) +
    (staffOptions && defaultStaffId !== "all" ? 1 : 0);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, val] of Object.entries(next)) {
      if (!val) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }

    params.delete("page");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`);
  }

  function clearAllFilters() {
    updateParams({
      status: null,
      staffId: null,
    });
  }

  const renderFilterControls = (isMobile = false) => (
    <>
      {staffOptions ? (
        <Select
          defaultValue={defaultStaffId}
          onValueChange={(next) =>
            updateParams({ staffId: next === "all" ? null : next })
          }
        >
          <SelectTrigger className={isMobile ? "w-full" : "w-full sm:w-48"}>
            <SelectValue placeholder="Staff">
              {(value: string) => {
                const name = staffLabels[value];
                if (!name || value === "all") return name ?? "Staff";
                return (
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar className="size-5 shrink-0">
                      <AvatarImage src={staffAvatarSrc(name)} alt={name} />
                      <AvatarFallback
                        className="!text-white text-[10px] font-semibold"
                        style={{ backgroundImage: avatarGradient(name) }}
                      >
                        {initialsFor(name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{name}</span>
                  </span>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="all">All staff</SelectItem>
            {staffOptions.map((staffMember) => {
              const name = `${staffMember.firstName} ${staffMember.lastName}`.trim();
              return (
                <SelectItem key={staffMember.id} value={staffMember.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar className="size-5 shrink-0">
                      <AvatarImage src={staffAvatarSrc(name)} alt={name} />
                      <AvatarFallback
                        className="!text-white text-[10px] font-semibold"
                        style={{ backgroundImage: avatarGradient(name) }}
                      >
                        {initialsFor(name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{name}</span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      ) : null}

      <Select
        defaultValue={defaultStatus}
        onValueChange={(next) =>
          updateParams({ status: next === "all" ? null : next })
        }
      >
        <SelectTrigger className={isMobile ? "w-full" : "w-full sm:w-40"}>
          <SelectValue placeholder="Status">
            {(value: string) => STATUS_LABELS[value] ?? "Status"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {STATUS_VALUES.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <div className="w-full">
      {/* Desktop view: inline filters */}
      <div className="hidden sm:flex sm:flex-row sm:items-center sm:gap-3">
        {renderFilterControls(false)}
      </div>

      {/* Mobile view: on-demand filter sheet */}
      <div className="flex w-full items-center justify-between gap-2 sm:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger render={<Button variant="outline" size="sm" />}>
            <SlidersHorizontalIcon className="size-4" />
            <span>Filters</span>
            {activeFilterCount > 0 ? (
              <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full text-xs font-semibold">
                {activeFilterCount}
              </span>
            ) : null}
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl p-5">
            <SheetHeader className="p-0 pb-3">
              <SheetTitle>Filter leave requests</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 py-2">
              {renderFilterControls(true)}
            </div>
            {activeFilterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="mt-2 w-full text-muted-foreground"
              >
                <RotateCcwIcon className="size-3.5" />
                Reset all filters
              </Button>
            ) : null}
          </SheetContent>
        </Sheet>

        {activeFilterCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-muted-foreground text-xs"
          >
            <XIcon className="size-3.5" />
            Clear ({activeFilterCount})
          </Button>
        ) : null}
      </div>
    </div>
  );
}
