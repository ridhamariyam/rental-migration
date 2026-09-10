import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { isSuperAdminAuthenticated } from "@/lib/auth/admin-session";

export const metadata = {
  title: "Sign in — Rentque",
};

export default async function AdminLoginPage() {
  if (await isSuperAdminAuthenticated()) {
    redirect("/admin");
  }

  return (
    <AuthSplitLayout
      eyebrow="Platform administration"
      title="Welcome back"
      description="Sign in to the platform admin console."
      footnote="Platform administration only — access is provisioned directly by the team, there is no self-service sign-up."
    >
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
