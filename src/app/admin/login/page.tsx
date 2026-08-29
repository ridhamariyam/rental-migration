import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { BrandPanel } from "@/components/admin/brand-panel";
import { LogoMark } from "@/components/admin/logo-mark";
import { isSuperAdminAuthenticated } from "@/lib/auth/admin-session";

export const metadata = {
  title: "Sign in — Rentique",
};

export default async function AdminLoginPage() {
  if (await isSuperAdminAuthenticated()) {
    redirect("/admin");
  }

  return (
    <main className="bg-muted/40 flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="bg-card ring-foreground/10 grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl ring-1 md:min-h-[600px] md:grid-cols-2">
        <div className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
          <div className="mx-auto flex w-full max-w-sm flex-col gap-10">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg">
                <LogoMark className="size-8 object-contain" />
              </span>
              <span className="font-script text-2xl font-bold tracking-wide overflow-visible px-1 py-0.5 inline-block">Rentique</span>
            </div>

            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-balance">
                  Welcome back
                </h1>
                <p className="text-muted-foreground text-sm">
                  Sign in to the platform admin console.
                </p>
              </div>

              <Suspense>
                <AdminLoginForm />
              </Suspense>

              <p className="text-muted-foreground text-sm">
                Platform administration only — access is provisioned directly by
                the team, there is no self-service sign-up.
              </p>
            </div>
          </div>
        </div>

        <BrandPanel />
      </div>
    </main>
  );
}
