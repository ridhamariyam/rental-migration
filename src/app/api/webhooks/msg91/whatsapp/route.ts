import { env } from "@/lib/env";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { AppError } from "@/lib/errors/app-error";
import { constantTimeEquals } from "@/lib/crypto/constant-time-equals";
import { applyMsg91Webhook } from "@/server/notifications/service";

/**
 * MSG91 doesn't sign its webhook payloads, so without some shared secret
 * this would be a fully unauthenticated endpoint that writes to the
 * database based on whatever JSON an attacker sends — configure the
 * webhook URL in MSG91's dashboard as
 * `https://<your-domain>/api/webhooks/msg91/whatsapp?token=<MSG91_WEBHOOK_SECRET>`
 * so every real callback carries it.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token || !constantTimeEquals(token, env.MSG91_WEBHOOK_SECRET)) {
      throw AppError.unauthorized("Invalid webhook token");
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await applyMsg91Webhook(payload);
    return apiSuccess({ received: true }, "Webhook received");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
