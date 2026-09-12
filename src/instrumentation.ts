/**
 * Runs once when a new Next.js server instance starts:
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * Used here to drive the notification outbox in-process (see
 * `dispatchDueNotifications` in `src/server/notifications/service.ts`), so
 * a single `next start` deployment sends queued WhatsApp messages on its
 * own — no second Railway cron service (`railway.notifications.json`)
 * required anymore. That config is kept around only as a fallback if this
 * ever needs to move back out of the web process.
 *
 * Only runs under `next start` (NODE_ENV=production) in the Node.js
 * runtime — local dev keeps using `pnpm notifications:worker` instead.
 * Safe even if both run at once, or if Railway scales this service to
 * multiple instances: `claimDueNotifications` claims rows with
 * `FOR UPDATE SKIP LOCKED`, so overlapping dispatchers never double-send.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") {
    return;
  }

  const { dispatchDueNotifications } = await import("@/server/notifications/service");

  const intervalMs = Number(process.env.NOTIFICATION_DISPATCH_INTERVAL_MS ?? 5 * 60_000);

  const tick = async () => {
    try {
      const attempted = await dispatchDueNotifications();
      if (attempted > 0) {
        console.log(`[notifications] dispatched ${attempted}`);
      }
    } catch (error) {
      console.error(
        `[notifications] scheduled dispatch failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  };

  void tick();
  setInterval(() => void tick(), intervalMs);
}
