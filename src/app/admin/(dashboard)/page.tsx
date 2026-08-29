import Link from "next/link";
import { Building2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TenantStatsTiles } from "@/components/admin/tenant-stats-tiles";
import { adminPaths } from "@/lib/admin-paths";
import { getTenantStats } from "@/server/tenants/service";

export const metadata = {
  title: "Dashboard — Rentique Admin",
};

// Reads live tenant counts on every load rather than serving a cached
// summary — this is the platform admin's first screen, it should never
// show stale numbers.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const stats = await getTenantStats();

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          An overview of every business running on the platform.
        </p>
      </div>

      {stats.total === 0 ? (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon />
            </EmptyMedia>
            <EmptyTitle>No tenants onboarded yet</EmptyTitle>
            <EmptyDescription>
              Tenant management lands in the next phase. Once it does,
              businesses you onboard will show up here with their status, plan,
              and activity.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={adminPaths.tenants} />}
            >
              View tenants
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <TenantStatsTiles stats={stats} />
      )}
    </main>
  );
}
