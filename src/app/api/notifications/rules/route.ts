import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateNotificationRulesSchema } from "@/lib/validation/notifications";
import {
  listNotificationRules,
  updateNotificationRules,
} from "@/server/notifications/service";

export async function GET() {
  try {
    const user = await requireTenantUser(Permission.NOTIFICATION_VIEW);
    return apiSuccess(await listNotificationRules(user.shopId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireTenantUser(Permission.NOTIFICATION_MANAGE);
    const body = updateNotificationRulesSchema.parse(await request.json());

    return apiSuccess(
      await updateNotificationRules(user.shopId, body.rules),
      "Notification rules saved",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
