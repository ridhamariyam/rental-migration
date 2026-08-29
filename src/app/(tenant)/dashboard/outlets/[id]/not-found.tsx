import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { tenantPaths } from "@/lib/tenant-paths";

export default function OutletNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>Outlet not found</EmptyTitle>
          <EmptyDescription>
            It may have been removed, or the link is incorrect.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={tenantPaths.outlets} />}
          >
            Back to outlets
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
