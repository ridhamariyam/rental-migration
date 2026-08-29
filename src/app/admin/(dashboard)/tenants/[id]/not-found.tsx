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
import { adminPaths } from "@/lib/admin-paths";

export default function TenantNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>Tenant not found</EmptyTitle>
          <EmptyDescription>
            It may have been removed, or the link is incorrect.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={adminPaths.tenants} />}
          >
            Back to tenants
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
