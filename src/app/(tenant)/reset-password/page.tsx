import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { ResetPasswordForm } from "@/components/tenant/reset-password-form";
import { TenantSignOutButton } from "@/components/tenant/tenant-sign-out-button";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = {
  title: "Set a new password — Rentique",
};

/**
 * The only reachable authenticated route for a `mustChangePassword`
 * account (enforced in `dashboard/layout.tsx`, which redirects here) — and
 * conversely, not reachable at all once the flag is cleared, so someone who
 * already reset can't land back on this screen and be confused into doing
 * it again.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.mustChangePassword) {
    redirect("/dashboard");
  }

  return (
    <main className="bg-muted/40 flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="bg-card ring-foreground/10 flex w-full max-w-md flex-col gap-8 rounded-3xl p-8 ring-1 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Wordmark />
          </div>
          <TenantSignOutButton />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Set a new password
          </h1>
          <p className="text-muted-foreground text-sm">
            You&rsquo;re signed in with a temporary password. Choose a new one
            to continue — this only takes a moment.
          </p>
        </div>

        <ResetPasswordForm />
      </div>
    </main>
  );
}
