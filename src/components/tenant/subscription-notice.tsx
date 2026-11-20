import Link from "next/link";
import { ClockAlertIcon, LockIcon, MessageCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubscriptionRenew } from "@/components/tenant/subscription-renew";
import {
  daysUntil,
  SUBSCRIPTION_GRACE_DAYS,
  whatsappLink,
  type PlanCatalog,
  type SubscriptionState,
} from "@/lib/plans";
import { tenantPaths } from "@/lib/tenant-paths";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

/**
 * Thin strip above every dashboard page while the subscription is about to
 * end or already overdue (still inside the grace period). Owners get a
 * Renew button; staff are told to ask the owner, since only the owner can
 * pay.
 */
export function SubscriptionBanner({
  state,
  endsAt,
  isOwner,
}: {
  state: SubscriptionState;
  endsAt: Date;
  isOwner: boolean;
}) {
  if (state !== "expiring" && state !== "grace") return null;

  const days = daysUntil(endsAt);
  const lockDate = new Date(endsAt.getTime() + SUBSCRIPTION_GRACE_DAYS * 86_400_000);
  const message =
    state === "expiring"
      ? `Your Rentque subscription ends ${days <= 1 ? "tomorrow" : `in ${days} days`} (${dateFormat.format(endsAt)}).`
      : `Your Rentque subscription ended on ${dateFormat.format(endsAt)}. The dashboard locks on ${dateFormat.format(lockDate)} unless it's renewed.`;

  return (
    <div
      role="status"
      className={
        state === "grace"
          ? "flex flex-col gap-2 border-b border-orange-500/25 bg-orange-500/10 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between print:hidden"
          : "flex flex-col gap-2 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between print:hidden"
      }
    >
      <span className="flex items-start gap-2">
        <ClockAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {message}
          {isOwner ? "" : " Ask the business owner to renew it."}
        </span>
      </span>
      {isOwner ? (
        <Button size="sm" nativeButton={false} render={<Link href={tenantPaths.subscription} />} className="shrink-0">
          Renew now
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Replaces the whole dashboard once the grace period is over. The owner
 * can renew right here; everyone else is told who can. Nothing else in
 * the dashboard is reachable until the subscription is paid (the API
 * refuses locked shops too — see `requireTenantUser`).
 */
export function SubscriptionLockScreen({
  isOwner,
  endsAt,
  businessName,
  plans,
  currentPlan,
  razorpayEnabled,
}: {
  isOwner: boolean;
  endsAt: Date;
  businessName: string;
  plans: PlanCatalog | null;
  currentPlan: "yearly" | "monthly" | "custom" | null;
  razorpayEnabled: boolean;
}) {
  return (
    <main className="flex flex-1 items-start justify-center p-4 sm:p-8">
      <div className="bg-card ring-foreground/10 flex w-full max-w-2xl flex-col gap-5 rounded-2xl p-5 shadow-sm ring-1 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-full">
            <LockIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold tracking-tight">Your subscription has expired</h1>
            <p className="text-muted-foreground text-sm">
              {businessName}&apos;s Rentque plan ended on {dateFormat.format(endsAt)}. Your data is safe. Renew to
              unlock bookings, products, customers and everything else straight away.
            </p>
          </div>
        </div>

        {isOwner && plans ? (
          <SubscriptionRenew
            plans={plans}
            currentPlan={currentPlan}
            endsAt={endsAt.toISOString()}
            businessName={businessName}
            razorpayEnabled={razorpayEnabled}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">Only the business owner can renew. Please ask them to sign in and renew the plan.</p>
            <Button
              variant="outline"
              className="w-fit"
              nativeButton={false}
              render={
                <a
                  href={whatsappLink(`Hi, the Rentque subscription for ${businessName} has expired.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <MessageCircleIcon />
              Contact Rentque on WhatsApp
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
