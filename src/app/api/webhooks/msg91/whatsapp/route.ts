import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { applyMsg91Webhook } from "@/server/notifications/service";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await applyMsg91Webhook(payload);
    return apiSuccess({ received: true }, "Webhook received");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
