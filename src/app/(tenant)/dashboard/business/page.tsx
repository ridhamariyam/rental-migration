import { redirect } from "next/navigation";
import { Building2Icon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessSettingsForm } from "@/components/tenant/business-settings-form";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { getOwnShop } from "@/server/business/service";

export const metadata = {
  title: "Business Settings — Rentique",
};

export const dynamic = "force-dynamic";

/**
 * "Business Settings" — admin-only, gated by `Permission.SHOP_MANAGE`
 * (granted to `admin`/`super_admin` only, see `permissions.ts`). The fix
 * for the legacy backend gap CLAUDE.md documents: a shop owner previously
 * had no route at all to edit their own shop's name/email/phone/address.
 */
export default async function BusinessSettingsPage() {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    redirect("/login");
  }

  if (!hasPermission(user.role, Permission.SHOP_MANAGE)) {
    redirect(tenantPaths.dashboard);
  }

  const shop = await getOwnShop(user.shopId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Business Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your business&apos;s own name, contact details, and logo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2Icon className="text-muted-foreground size-4" />
            Business profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BusinessSettingsForm shop={shop} />
        </CardContent>
      </Card>
    </main>
  );
}
