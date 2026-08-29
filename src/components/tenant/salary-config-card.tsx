import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddSalaryDialog } from "@/components/tenant/add-salary-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatDate, formatMoney } from "@/lib/format";
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
                  ? "Add a monthly amount to start calculating salary."
                  : "Ask your owner to configure your pay."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y">
            {configs.map((config, index) => (
              <div
                key={config.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {formatMoney(config.amount)} / month
                    {index === 0 ? (
                      <span className="text-primary ml-2 text-xs font-normal">
                        Current
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    From {formatDate(config.effectiveDate)} ·{" "}
                    {config.workingDaysPerMonth} working days/month
                  </span>
                  {config.note ? (
                    <span className="text-muted-foreground text-xs">
                      {config.note}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
