"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AuditActionBadge } from "@/components/tenant/audit-action-badge";
import { formatDateTime } from "@/lib/format";
import { EyeIcon } from "lucide-react";

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Every key present in either state, before/after side by side — a
 * plain key-value diff rather than a raw JSON dump, so a non-technical
 * owner can actually read what changed. Unchanged values still show (for
 * context), changed ones are highlighted. */
function StateDiff({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];

  if (keys.length === 0) {
    return <p className="text-muted-foreground text-sm">No additional detail recorded.</p>;
  }

  return (
    <div className="divide-y rounded-lg border">
      {keys.map((key) => {
        const beforeValue = before ? before[key] : undefined;
        const afterValue = after ? after[key] : undefined;
        const changed =
          before && after && JSON.stringify(beforeValue) !== JSON.stringify(afterValue);

        return (
          <div key={key} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
            <span className="text-muted-foreground shrink-0">{humanizeKey(key)}</span>
            <span className="flex min-w-0 items-center gap-2 text-right">
              {before ? (
                <span
                  className={changed ? "text-muted-foreground line-through" : "font-medium"}
                >
                  {formatValue(beforeValue)}
                </span>
              ) : null}
              {before && after ? <span className="text-muted-foreground">→</span> : null}
              {after ? (
                <span className={changed ? "text-primary font-medium" : "font-medium"}>
                  {formatValue(afterValue)}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AuditLogDetailDialog({
  action,
  entityType,
  summary,
  userName,
  createdAt,
  before,
  after,
}: {
  action: string;
  entityType: string;
  summary: string | null;
  userName: string | null;
  createdAt: Date;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="View details" />}>
        <EyeIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AuditActionBadge action={action} />
          </DialogTitle>
          <DialogDescription>
            {summary || "No summary recorded"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>{formatDateTime(createdAt)}</span>
            <span>{userName || "Platform admin"}</span>
          </div>
          <StateDiff before={before} after={after} />
          <p className="text-muted-foreground text-xs capitalize">
            Entity: {entityType.replace("_", " ")}
          </p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
