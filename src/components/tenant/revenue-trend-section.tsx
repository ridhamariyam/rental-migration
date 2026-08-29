import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueTrendChart } from "@/components/tenant/revenue-trend-chart";
import { formatMoney, toDateString } from "@/lib/format";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getDailyIncome } from "@/server/reports/service";
import { TrendingUpIcon } from "lucide-react";

/** The dashboard's "Revenue trend" card — the last 14 days of income,
 * reusing `getDailyIncome` (the same query the Reports page's Daily
 * Income tab runs) rather than a bespoke dashboard-only query. */
export async function RevenueTrendSection({
  actor,
}: {
  actor: TenantSessionUser;
}) {
  const now = new Date();
  const toDate = toDateString(now);
  const fromDate = toDateString(new Date(now.getTime() - 13 * 86_400_000));

  const { total, rows } = await getDailyIncome(actor, { fromDate, toDate });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUpIcon className="size-4" aria-hidden="true" />
          Revenue trend
        </CardTitle>
        <span className="text-muted-foreground text-sm">
          Last 14 days · <span className="text-foreground font-medium">{formatMoney(total)}</span>
        </span>
      </CardHeader>
      <CardContent>
        <RevenueTrendChart data={rows} />
      </CardContent>
    </Card>
  );
}
