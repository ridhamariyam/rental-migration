/**
 * One-shot notification dispatch, for a scheduled (cron) run.
 *
 * Queueing only inserts a `notification_logs` row; nothing in a request
 * sends it. In production nothing was calling the dispatch endpoint at
 * all — the only caller in the repo was the local polling loop in
 * `notification-worker.ts` — so the outbox was write-only (audit item 12).
 *
 * This is the production counterpart: it runs once, reports, and exits,
 * which is what a cron scheduler expects. Deployed as the `notifications`
 * cron service in `railway.json`.
 *
 * It calls the HTTP endpoint rather than `dispatchDueNotifications`
 * directly so it exercises the same worker-secret auth path a manual
 * trigger would, and so the cron container does not need database
 * credentials of its own.
 *
 * Exit codes: 0 on success, 1 on a failure the scheduler should surface.
 *
 * Retries and restart-safety are handled by the dispatcher, not here:
 * `claimDueNotifications` claims rows with `FOR UPDATE SKIP LOCKED` and
 * increments `attempts`, so two overlapping runs never send the same
 * message twice, a crashed run leaves the row claimable again, and a row
 * is retried until `MAX_ATTEMPTS`.
 */
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3003").replace(
  /\/$/,
  "",
);
const secret = process.env.NOTIFICATION_WORKER_SECRET;
const timeoutMs = Number(process.env.NOTIFICATION_DISPATCH_TIMEOUT_MS ?? 60_000);

async function main(): Promise<void> {
  if (!secret) {
    console.error(
      "NOTIFICATION_WORKER_SECRET is not set — the cron service needs the same value as the app.",
    );
    process.exit(1);
  }

  const response = await fetch(`${appUrl}/api/internal/notifications/dispatch`, {
    method: "POST",
    headers: { "x-worker-secret": secret },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    data?: { attempted?: number };
  };

  if (!response.ok) {
    console.error(
      `[notifications] dispatch failed: ${response.status} ${payload.message ?? ""}`.trim(),
    );
    process.exit(1);
  }

  console.log(`[notifications] dispatched ${payload.data?.attempted ?? 0}`);
}

main().catch((error: unknown) => {
  console.error(
    `[notifications] ${error instanceof Error ? error.message : "dispatch failed"}`,
  );
  process.exit(1);
});

// Marks this file as a module so its top-level bindings stay local —
// otherwise it shares global scope with the other scripts.
export {};
