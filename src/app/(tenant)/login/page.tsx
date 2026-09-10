import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BoxesIcon, CalendarCheckIcon, CreditCardIcon } from "lucide-react";
import { TenantLoginForm } from "@/components/tenant/tenant-login-form";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = {
  title: "Sign in — Rentque",
};

/** What the product does, named the way the sidebar names it. Not
 * statistics, and not a feature pitch — orientation for someone checking
 * they are signing in to the right tool. */
const CAPABILITIES = [
  { label: "Inventory", icon: BoxesIcon },
  { label: "Bookings", icon: CalendarCheckIcon },
  { label: "Payments", icon: CreditCardIcon },
];

export default async function TenantLoginPage() {
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }

  return (
    <AuthSplitLayout
      eyebrow="Rental management platform"
      title="Welcome back"
      description="Sign in to manage your rental business."
      footnote="Your account is created by your platform administrator."
      capabilities={
        <ul className="hidden flex-wrap items-center gap-x-8 gap-y-3 sm:flex">
          {CAPABILITIES.map(({ label, icon: Icon }) => (
            <li
              key={label}
              className="text-auth-muted flex items-center gap-2 text-[13px]"
            >
              <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      }
    >
      <Suspense>
        <TenantLoginForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
