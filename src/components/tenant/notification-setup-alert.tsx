import Link from "next/link";
import { BellOffIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_EVENT_LABELS } from "@/lib/notifications";
import { tenantPaths } from "@/lib/tenant-paths";
import { getNotificationSetupIssues } from "@/server/notifications/service";

/**
 * Dashboard banner for WhatsApp messages that are switched on but can't
 * send. Queueing skips such rules without an error, so without this the
 * first sign of a missing number or template is a customer asking why
 * they never got their confirmation. Renders nothing when all is well.
 */
export async function NotificationSetupAlert({ shopId }: { shopId: string }) {
  const issues = await getNotificationSetupIssues(shopId);
  if (issues.length === 0) return null;

  const labels = issues.map((issue) => NOTIFICATION_EVENT_LABELS[issue.event]);

  return (
    <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200">
      <BellOffIcon />
      <AlertTitle className="font-semibold">
        {issues.length === 1
          ? "1 WhatsApp message is switched on but not sending"
          : `${issues.length} WhatsApp messages are switched on but not sending`}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2 text-amber-900/80 sm:flex-row sm:items-center sm:justify-between dark:text-amber-200/80">
        <span>
          {labels.join(", ")}. Customers won&rsquo;t get these until a
          WhatsApp number and an approved template are picked for each — or
          switch them off.
        </span>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={tenantPaths.notifications} />}
          className="shrink-0 self-start sm:self-auto"
        >
          Fix in Notifications
        </Button>
      </AlertDescription>
    </Alert>
  );
}
