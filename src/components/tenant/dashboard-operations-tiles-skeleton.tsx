import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardOperationsTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-7 rounded-full" />
            </div>
            <Skeleton className="h-7 w-10" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
