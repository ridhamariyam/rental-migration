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
