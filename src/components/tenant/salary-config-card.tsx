import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddSalaryDialog } from "@/components/tenant/add-salary-dialog";
import { DeleteRecordButton } from "@/components/tenant/delete-record-button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatDate, formatMoney, formatWeeklyOffDay } from "@/lib/format";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listStaffSalaries } from "@/server/salary/service";
import { WalletIcon } from "lucide-react";

export async function SalaryConfigCard({
  actor,
  staffId,
  canManage,
}: {
  actor: TenantSessionUser;
  staffId: string;
  canManage: boolean;
}) {
  const configs = await listStaffSalaries(actor, staffId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <WalletIcon className="size-4" aria-hidden="true" />
          Pay configuration
        </CardTitle>
        {canManage ? <AddSalaryDialog staffId={staffId} /> : null}
      </CardHeader>
      <CardContent>
        {configs.length === 0 ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WalletIcon />
              </EmptyMedia>
              <EmptyTitle>No pay configured yet</EmptyTitle>
              <EmptyDescription>
                {canManage
                  ? "Set an hourly rate to start calculating salary from hours worked."
                  : "Ask your owner to configure your pay."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y">
            {configs.map((config, index) => (
              <div
                key={config.id}
                className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {formatMoney(config.hourlyRate)} / hour
                    {index === 0 ? (
                      <span className="text-primary ml-2 text-xs font-normal">
                        Current
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {config.overtimeRatePerHour
                      ? `${formatMoney(config.overtimeRatePerHour)}/hr extra worktime`
                      : "Extra worktime unpaid"}{" "}
                    · {config.standardHoursPerDay}h/day ·{" "}
                    {formatWeeklyOffDay(config.weeklyOffDay)} off
                  </span>
                  <span className="text-muted-foreground text-xs">
                    From {formatDate(config.effectiveDate)}
                    {config.amount
                      ? ` · ${formatMoney(config.amount)}/month quoted`
                      : ""}
                  </span>
                  {config.note ? (
                    <span className="text-muted-foreground text-xs">
                      {config.note}
                    </span>
                  ) : null}
                </div>

                {/* Editable, not just addable: a dated configuration still
                    has to be correctable in place when the rate was typed
                    wrong — a raise is what earns a new row. */}
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <AddSalaryDialog staffId={staffId} salary={config} />
                    <DeleteRecordButton
                      endpoint={`/api/salary/${config.id}`}
                      title="Delete this pay configuration?"
                      description="It is removed for good. Payslips already generated keep the figures they were priced at, but any month that would have used this configuration can no longer be calculated until another one covers it."
                      confirmLabel="Delete configuration"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
