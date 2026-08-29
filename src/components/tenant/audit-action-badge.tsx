import { Badge } from "@/components/ui/badge";
import { AuditAction } from "@/lib/audit-actions";

const ACTION_META: Record<string, { label: string; tone: "neutral" | "positive" | "negative" }> = {
  [AuditAction.TENANT_CREATED]: { label: "Tenant created", tone: "positive" },
  [AuditAction.TENANT_BLOCKED]: { label: "Tenant blocked", tone: "negative" },
  [AuditAction.TENANT_UNBLOCKED]: { label: "Tenant unblocked", tone: "positive" },
  [AuditAction.STAFF_CREATED]: { label: "Staff created", tone: "positive" },
  [AuditAction.STAFF_UPDATED]: { label: "Staff updated", tone: "neutral" },
  [AuditAction.STAFF_ROLE_CHANGED]: { label: "Role changed", tone: "neutral" },
  [AuditAction.STAFF_STATUS_CHANGED]: { label: "Status changed", tone: "neutral" },
  [AuditAction.SALARY_CONFIGURED]: { label: "Salary configured", tone: "positive" },
  [AuditAction.SALARY_UPDATED]: { label: "Salary updated", tone: "neutral" },
  [AuditAction.SALARY_DELETED]: { label: "Salary deleted", tone: "negative" },
  [AuditAction.SETTLEMENT_PAID]: { label: "Settlement paid", tone: "positive" },
  [AuditAction.ATTENDANCE_CORRECTED]: { label: "Attendance corrected", tone: "neutral" },
  [AuditAction.LEAVE_DECIDED]: { label: "Leave decided", tone: "neutral" },
  [AuditAction.BOOKING_DISCOUNT_APPLIED]: { label: "Discount applied", tone: "neutral" },
  [AuditAction.BOOKING_CANCELLED]: { label: "Booking cancelled", tone: "negative" },
  [AuditAction.BOOKING_PICKED_UP]: { label: "Booking picked up", tone: "positive" },
  [AuditAction.BOOKING_RETURNED]: { label: "Booking returned", tone: "positive" },
  [AuditAction.PAYMENT_RECORDED]: { label: "Payment recorded", tone: "positive" },
  [AuditAction.PAYMENT_REFUNDED]: { label: "Payment refunded", tone: "negative" },
};

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-primary/10 text-primary",
  negative: "bg-destructive/10 text-destructive",
};

/** Same badge-family treatment as `PaymentStatusBadge`/`SettlementStatusBadge`
 * — maps every `AuditAction` value to a readable label + a tone (positive/
 * negative/neutral) rather than showing the raw dotted action string. */
export function AuditActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, tone: "neutral" as const };

  return (
    <Badge variant="secondary" className={TONE_CLASSES[meta.tone]}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

export function auditActionLabel(action: string): string {
  return ACTION_META[action]?.label ?? action;
}
