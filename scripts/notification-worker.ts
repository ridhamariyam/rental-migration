/**
 * Local stand-in for the production cron that drives
 * `POST /api/internal/notifications/dispatch`. Queueing a notification only
 * inserts a `queued` row (see `queueBookingNotification`); nothing in the
 * app sends it, so without this loop a dev database just accumulates
 * queued rows and no WhatsApp message ever leaves.
 *
 * Deliberately hits the HTTP endpoint rather than calling
 * `dispatchDueNotifications` directly, so it exercises the same auth path
 * the real worker will and doesn't open a second connection pool against a
 * `max: 1` dev Postgres.
 *
 * Usage: npm run notifications:worker
 */

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3003").replace(
  /\/$/,
  "",
);
const secret = process.env.NOTIFICATION_WORKER_SECRET;
const intervalMs = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? 30_000);

if (!secret) {
  console.error(
    "NOTIFICATION_WORKER_SECRET is not set — add it to .env.local (openssl rand -hex 32).",
  );
  process.exit(1);
}

async function tick(): Promise<void> {
  try {
    const response = await fetch(`${appUrl}/api/internal/notifications/dispatch`, {
      method: "POST",
      headers: { "x-worker-secret": secret as string },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      data?: { attempted?: number };
    };

    if (!response.ok) {
      console.error(`[notifications] ${response.status}: ${payload.message ?? "failed"}`);
      return;
    }

    const attempted = payload.data?.attempted ?? 0;
    if (attempted > 0) {
      console.log(`[notifications] dispatched ${attempted}`);
    }
  } catch (error) {
    console.error(
      `[notifications] ${error instanceof Error ? error.message : "dispatch failed"}`,
    );
  }
}

console.log(
  `[notifications] polling ${appUrl} every ${Math.round(intervalMs / 1000)}s — Ctrl+C to stop`,
);

void tick();
setInterval(() => void tick(), intervalMs);

// Marks this file as a module so its top-level bindings stay local.
export {};
