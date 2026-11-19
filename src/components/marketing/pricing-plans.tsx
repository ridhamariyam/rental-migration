import Link from "next/link";
import { CheckIcon, MessageCircleIcon, SparklesIcon } from "lucide-react";
import {
  CUSTOM_PLAN_FEATURES,
  CUSTOM_PLAN_WHATSAPP_MESSAGE,
  PLANS,
  PLAN_FEATURES,
  formatRupees,
  signupTotal,
  whatsappLink,
  type Plan,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

function PlanCard({ plan, featured }: { plan: Plan; featured?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-white p-6 sm:p-7",
        featured ? "border-primary shadow-[0_8px_30px_-12px_rgb(0_150_117/0.35)]" : "border-auth-line",
      )}
    >
      {featured ? (
        <span className="bg-primary absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-medium tracking-wide text-white uppercase">
          Best value
        </span>
      ) : null}
      <h3 className="text-lg font-medium tracking-tight">{plan.name}</h3>
      <p className="text-auth-muted mt-1 text-sm">{plan.tagline}</p>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-4xl font-medium tracking-[-0.03em]">{formatRupees(plan.price)}</span>
        <span className="text-auth-muted text-sm">/ {plan.periodLabel}</span>
      </div>
      <p className="text-auth-muted mt-1 text-sm">
        + {formatRupees(plan.setupFee)} one-time setup · {formatRupees(signupTotal(plan))} today
      </p>

      <Link
        href={`/signup?plan=${plan.id}`}
        className={cn(
          "mt-6 inline-flex h-11 items-center justify-center rounded-[10px] px-5 text-[15px] font-medium transition-colors",
          featured
            ? "bg-primary hover:bg-primary/85 text-white"
            : "border-auth-line text-auth-ink border bg-white hover:bg-neutral-50",
        )}
      >
        Buy {plan.name.toLowerCase()} plan
      </Link>

      <ul className="mt-7 flex flex-col gap-2.5 text-sm">
        {PLAN_FEATURES.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <CheckIcon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Public pricing: the two self-serve plans plus the WhatsApp custom plan. */
export function PricingPlans() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <PlanCard plan={PLANS.yearly} featured />
      <PlanCard plan={PLANS.monthly} />

      <div className="border-auth-line flex flex-col rounded-2xl border bg-[#f3f2ee] p-6 sm:p-7">
        <h3 className="flex items-center gap-2 text-lg font-medium tracking-tight">
          <SparklesIcon className="text-primary size-4" aria-hidden="true" />
          Custom
        </h3>
        <p className="text-auth-muted mt-1 text-sm">
          Everything in the standard plans, plus what your business needs.
        </p>
        <div className="mt-6 text-4xl font-medium tracking-[-0.03em]">Let&apos;s talk</div>
        <p className="text-auth-muted mt-1 text-sm">Priced to your requirements</p>

        <a
          href={whatsappLink(CUSTOM_PLAN_WHATSAPP_MESSAGE)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#1f8a4c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1a7841]"
        >
          <MessageCircleIcon className="size-4" aria-hidden="true" />
          Contact us on WhatsApp
        </a>

        <ul className="mt-7 flex flex-col gap-2.5 text-sm">
          {CUSTOM_PLAN_FEATURES.map((feature) => (
            <li key={feature} className="flex gap-2.5">
              <CheckIcon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
