import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RevenueTrendSectionSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader className="border-border/60 flex flex-row items-center justify-between space-y-0 border-b px-4 py-3.5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
          </CardHeader>
          <CardContent className="px-4 py-3">
            <Skeleton className="h-56 w-full rounded-lg" />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-border/60 flex flex-row items-center justify-between space-y-0 border-b px-4 py-3.5">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="size-4 rounded" />
          </CardHeader>
          <CardContent className="px-5 py-4">
            <div className="flex flex-col items-center gap-5 py-4">
              <Skeleton className="size-28 rounded-full" />
              <div className="w-full space-y-3">
                <Skeleton className="h-4 w-full" />
                <div className="grid grid-cols-2 gap-2.5">
                  <Skeleton className="h-14 rounded-lg" />
                  <Skeleton className="h-14 rounded-lg" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="border-border/60 border-b px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
