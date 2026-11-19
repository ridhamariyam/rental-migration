import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors/app-error";

/**
 * Minimal Razorpay client — just the two calls the platform's own
 * subscription billing needs (create an order, verify signatures). Plain
 * `fetch` against the REST API rather than the SDK: it is two endpoints,
 * and the SDK would be one more dependency to keep patched.
 *
 * Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
 */
const RAZORPAY_API = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId(): string {
  return env.RAZORPAY_KEY_ID;
}

export function assertRazorpayConfigured(): void {
  if (!isRazorpayConfigured()) {
    throw new AppError(
      "Online payment isn't available right now. Please contact us on WhatsApp to get started.",
      503,
    );
  }
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string> | unknown[];
};

export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  assertRazorpayConfigured();

  const auth = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");

  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt.slice(0, 40),
      notes: params.notes ?? {},
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // Never echo the gateway's body to the client — it can mention the
    // account. Log it for the operator instead.
    const detail = await response.text().catch(() => "");
    console.error("Razorpay order creation failed", response.status, detail);
    throw new AppError(
      "Couldn't start the payment. Please try again in a moment.",
      502,
    );
  }

  return (await response.json()) as RazorpayOrder;
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Checkout success handler signature: HMAC(order_id|payment_id). Proves
 * the payment really belongs to this order and came from Razorpay. */
export function verifyCheckoutSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = hmacHex(
    env.RAZORPAY_KEY_SECRET,
    `${params.orderId}|${params.paymentId}`,
  );
  return safeEqualHex(expected, params.signature);
}

/** Webhook signature: HMAC of the raw request body with the webhook
 * secret (`X-Razorpay-Signature`). */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  return safeEqualHex(
    hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody),
    signature,
  );
}

type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
};

async function razorpayApi<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Razorpay API call failed", path, response.status, detail);
    throw new AppError("We couldn't confirm the payment with Razorpay. Please try again in a moment.", 502);
  }
  return (await response.json()) as T;
}

/**
 * Money check before anything is activated: a valid checkout/webhook
 * signature proves the payment belongs to our order, but not that the
 * money was actually *captured*, or captured in full. This asks Razorpay
 * for the payment and its order and requires: same order, INR, the exact
 * amount our server put on the order, and status `captured`. A payment
 * that is only `authorized` (auto-capture switched off on the account)
 * is captured here for that exact amount; otherwise it would be refunded
 * automatically after a few days while the account stayed active.
 */
export async function settleGatewayPayment(params: { orderId: string; paymentId: string }): Promise<void> {
  assertRazorpayConfigured();
  const [order, payment] = await Promise.all([
    razorpayApi<RazorpayOrder>(`/orders/${encodeURIComponent(params.orderId)}`),
    razorpayApi<RazorpayPayment>(`/payments/${encodeURIComponent(params.paymentId)}`),
  ]);

  // Only ever touch orders this app created (they carry our row id) —
  // never capture a payment belonging to another integration on the same
  // Razorpay account. Same message the webhook already treats as "ignore".
  const notes = order.notes && !Array.isArray(order.notes) ? order.notes : {};
  if (!notes.paymentRowId) {
    throw AppError.notFound("Payment not found");
  }
  if (payment.order_id !== order.id || order.id !== params.orderId) {
    throw new AppError("This payment doesn't belong to this order.", 400);
  }
  if (payment.currency !== "INR" || payment.amount !== order.amount) {
    console.error("Razorpay amount mismatch", { order: order.id, expected: order.amount, paid: payment.amount, currency: payment.currency });
    throw new AppError("The amount paid doesn't match the order. Please contact us on WhatsApp.", 400);
  }

  let status = payment.status;
  if (status === "authorized") {
    const captured = await razorpayApi<RazorpayPayment>(`/payments/${encodeURIComponent(payment.id)}/capture`, {
      method: "POST",
      body: JSON.stringify({ amount: order.amount, currency: "INR" }),
    });
    status = captured.status;
  }
  if (status !== "captured") {
    throw new AppError(
      "Your payment hasn't been completed yet. If money was deducted, it will be confirmed automatically shortly.",
      409,
    );
  }
}
