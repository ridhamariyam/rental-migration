import { redirect } from "next/navigation";
import { UserIcon, KeyRoundIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/tenant/profile-form";
import { ChangePasswordForm } from "@/components/tenant/change-password-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getOwnProfile } from "@/server/profile/service";

export const metadata = {
  title: "Profile — Rentique",
};

export const dynamic = "force-dynamic";

/**
 * Self-service "Profile" page — every signed-in tenant role (admin,
 * manager, staff) lands here, unlike "Business Settings" which is
 * admin-only (see `dashboard/business/page.tsx`). No `hasPermission` gate
 * beyond "is signed in": editing your own name/phone/photo/password isn't
 * a role-gated action.
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    redirect("/login");
  }

  const profile = await getOwnProfile(user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">
          Manage your own name, contact details, photo, and password.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="text-muted-foreground size-4" />
            Personal details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm user={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRoundIcon className="text-muted-foreground size-4" />
            Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
