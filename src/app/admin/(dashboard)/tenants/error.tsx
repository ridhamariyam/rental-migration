"use client";

import { useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Segment error boundary — catches anything that throws while rendering
 * `tenants/**` (e.g. the database being unreachable) so a real infra
 * problem shows a recoverable screen instead of Next's generic error page.
 */
export default function TenantsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Tenants section error:", error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangleIcon />
          </EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            We couldn&rsquo;t load this page. Please try again.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
