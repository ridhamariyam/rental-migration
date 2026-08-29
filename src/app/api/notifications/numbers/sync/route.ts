import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { syncWhatsappNumbersSchema } from "@/lib/validation/notifications";
import { syncWhatsappNumbers } from "@/server/notifications/service";

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.NOTIFICATION_MANAGE);
    const body = syncWhatsappNumbersSchema.parse(await request.json().catch(() => ({})));

    return apiSuccess(
      await syncWhatsappNumbers(user.shopId, body.integratedNumber),
      "WhatsApp numbers synced",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
