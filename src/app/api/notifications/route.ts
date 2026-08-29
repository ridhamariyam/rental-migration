import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { notificationListQuerySchema } from "@/lib/validation/notifications";
import { getNotificationDashboard } from "@/server/notifications/service";

export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.NOTIFICATION_VIEW);
    const { searchParams } = new URL(request.url);
    const query = notificationListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      event: searchParams.get("event") ?? undefined,
    });

    return apiSuccess(await getNotificationDashboard(user.shopId, query));
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
