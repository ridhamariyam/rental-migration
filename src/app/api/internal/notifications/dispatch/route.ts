import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { AppError } from "@/lib/errors/app-error";
import { dispatchDueNotifications } from "@/server/notifications/service";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("x-worker-secret");
    if (token !== env.NOTIFICATION_WORKER_SECRET) {
      throw AppError.unauthorized("Invalid worker secret");
    }

    const attempted = await dispatchDueNotifications();
    return apiSuccess({ attempted }, "Notification dispatch complete");
  } catch (error) {
    return apiError(error);
  }
}

export function GET() {
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
