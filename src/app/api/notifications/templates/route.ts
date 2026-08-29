import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { listWhatsappTemplates } from "@/server/notifications/service";

export async function GET() {
  try {
    const user = await requireTenantUser(Permission.NOTIFICATION_VIEW);
    return apiSuccess(await listWhatsappTemplates(user.shopId));
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
