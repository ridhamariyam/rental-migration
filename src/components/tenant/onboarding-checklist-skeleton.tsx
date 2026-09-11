import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function OnboardingChecklistSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5">
        <Skeleton className="mb-3 h-1.5 w-full rounded-full" />
        <div className="divide-border/60 flex flex-col divide-y">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
