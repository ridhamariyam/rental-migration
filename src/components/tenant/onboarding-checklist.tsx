import Link from "next/link";
import {
  Building2Icon,
  CheckCircle2Icon,
  ShirtIcon,
  TagsIcon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { tenantPaths } from "@/lib/tenant-paths";
import { getOnboardingStatus } from "@/server/onboarding/service";

/**
 * Dashboard "Get started" checklist — walks a brand-new shop through the
 * same initial setup order `docs/client-requirment.md` §4 describes
 * (outlet → categories → staff → products). Renders nothing once every
 * step is done, so it never lingers as dead weight on an established
 * shop's dashboard.
 */
export async function OnboardingChecklist({ shopId }: { shopId: string }) {
  const status = await getOnboardingStatus(shopId);

  if (status.complete) {
    return null;
  }

  const steps = [
    {
      id: "outlet",
      icon: Building2Icon,
      title: "Add your first outlet",
      description: "The branch your business operates from — required before staff or inventory can be assigned.",
      href: tenantPaths.newOutlet,
      cta: "Add outlet",
      done: status.hasOutlet,
    },
    {
      id: "category",
      icon: TagsIcon,
      title: "Create a category",
      description: "Group your products so they're easier to browse and filter.",
      href: tenantPaths.categories,
      cta: "Add category",
      done: status.hasCategory,
    },
    {
      id: "staff",
      icon: UsersIcon,
      title: "Add your team",
      description: "Create manager or staff logins and assign them to an outlet.",
      href: tenantPaths.newStaff,
      cta: "Add staff",
      done: status.hasStaff,
    },
    {
      id: "product",
      icon: ShirtIcon,
      title: "Add your first product",
      description: "Add a barcoded, bookable item to your rental catalogue.",
      href: tenantPaths.newProduct,
      cta: "Add product",
      done: status.hasBookableProduct,
    },
  ] as const;

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-base">Get started</CardTitle>
          <p className="text-muted-foreground text-xs">
            Finish setting up your business.
          </p>
        </div>
        <Badge variant="outline">
          {doneCount} of {steps.length} done
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5">
        <div className="bg-muted mb-3 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <div className="divide-border/60 flex flex-col divide-y">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  step.done
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-primary/10 text-primary",
                )}
              >
                {step.done ? (
                  <CheckCircle2Icon className="size-4" aria-hidden="true" />
                ) : (
                  <step.icon className="size-4" aria-hidden="true" />
                )}
              </span>
              <div className="flex flex-1 flex-col gap-0.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.done && "text-muted-foreground",
                  )}
                >
                  {step.title}
                </p>
                <p className="text-muted-foreground text-xs">
                  {step.description}
                </p>
              </div>
              {!step.done ? (
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={step.href} />}
                  className="h-8 shrink-0 px-3 text-xs"
                >
                  {step.cta}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
