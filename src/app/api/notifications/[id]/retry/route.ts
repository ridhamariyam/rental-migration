import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { retryNotificationParamSchema } from "@/lib/validation/notifications";
import { retryNotification } from "@/server/notifications/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.NOTIFICATION_MANAGE);
    const parsed = retryNotificationParamSchema.parse(await params);

    return apiSuccess(
      await retryNotification(user.shopId, parsed.id),
      "Notification queued for retry",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
