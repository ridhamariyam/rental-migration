"use client";

/**
 * Browser side of Razorpay Standard Checkout: loads checkout.js once and
 * wraps the modal in a promise. Resolves with the signed result on
 * success, rejects with `CheckoutDismissedError` if the buyer closes the
 * modal, or a plain Error if the payment fails.
 */
export type CheckoutSessionPayload = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
};

export type CheckoutSuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export class CheckoutDismissedError extends Error {
  constructor() {
    super("Payment was cancelled.");
    this.name = "CheckoutDismissedError";
  }
}

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export async function openRazorpayCheckout(
  session: CheckoutSessionPayload,
): Promise<CheckoutSuccess> {
  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Payment window unavailable. Please try again.");

  return new Promise<CheckoutSuccess>((resolve, reject) => {
    const instance = new Razorpay({
      key: session.keyId,
      order_id: session.orderId,
      amount: session.amountPaise,
      currency: session.currency,
      name: "Rentque",
      description: session.description,
      prefill: session.prefill,
      theme: { color: "#009675" },
      handler: (response: CheckoutSuccess) => resolve(response),
      modal: {
        ondismiss: () => reject(new CheckoutDismissedError()),
        confirm_close: true,
      },
    });
    instance.on("payment.failed", (response) => {
      reject(new Error(response.error?.description ?? "Payment failed. Please try again."));
    });
    instance.open();
  });
}
