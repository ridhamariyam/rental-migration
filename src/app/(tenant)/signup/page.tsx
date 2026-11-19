import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon, MessageCircleIcon } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { SignupForm } from "@/components/marketing/signup-form";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlanId, whatsappLink } from "@/lib/plans";
import { isRazorpayConfigured } from "@/server/billing/razorpay";
import { getPlans } from "@/server/billing/plans";

export const metadata = {
  title: "Create your account — Rentque",
};

/**
 * Public "Buy" page — the landing page's pricing cards and the demo
 * dashboard's "Get your own account" button both land here. A signed-in
 * *real* business has nothing to buy and goes to its dashboard; a demo
 * visitor stays, and paying swaps their demo session for their new
 * account's.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const user = await getCurrentUser();
  if (user && user.shopId && !user.shopIsDemo) {
    redirect("/dashboard");
  }
  const fromDemo = Boolean(user?.shopIsDemo);
  const plans = await getPlans();

  const { plan } = await searchParams;
  const initialPlan = isPlanId(plan) ? plan : "yearly";
  const paymentsEnabled = isRazorpayConfigured();

  return (
    <div className="bg-auth-canvas text-auth-ink flex min-h-full flex-1 flex-col">
      <header className="border-auth-line border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Rentque home">
            <Wordmark />
          </Link>
          {fromDemo ? (
            <Link
              href="/dashboard"
              className="text-auth-muted hover:text-auth-ink flex items-center gap-1.5 text-sm"
            >
              <ArrowLeftIcon className="size-4" aria-hidden="true" />
              Back to demo
            </Link>
          ) : (
            <p className="text-auth-muted text-sm">
              Have an account?{" "}
              <Link href="/login" className="text-auth-ink font-medium hover:underline">
                Sign in
              </Link>
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 max-w-2xl">
          <p className="text-auth-muted text-[11px] font-medium tracking-[0.18em] uppercase">
            {fromDemo ? "Liked the demo?" : "Get started"}
          </p>
          <h1 className="mt-3 text-[clamp(1.75rem,4.5vw,2.5rem)] leading-tight font-medium tracking-[-0.03em]">
            Create your Rentque account
          </h1>
          <p className="text-auth-muted mt-3 text-[15px] leading-relaxed">
            Pay securely, and your own workspace is ready instantly. Add your
            outlets, staff and stock, and start taking bookings today.
          </p>
        </div>

        {paymentsEnabled ? (
          <SignupForm initialPlan={initialPlan} plans={plans} />
        ) : (
          <div className="border-auth-line max-w-lg rounded-2xl border bg-white p-6 sm:p-8">
            <h2 className="text-lg font-medium tracking-tight">Online payment is coming soon</h2>
            <p className="text-auth-muted mt-2 text-sm">
              Message us on WhatsApp and we&apos;ll set up your account today.
            </p>
            <a
              href={whatsappLink(`Hi! I'd like to buy the Rentque ${initialPlan} plan.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#1f8a4c] px-5 text-[15px] font-medium text-white hover:bg-[#1a7841]"
            >
              <MessageCircleIcon className="size-4" aria-hidden="true" />
              Contact us on WhatsApp
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
