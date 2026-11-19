import { createSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkoutResultSchema } from "@/lib/validation/billing";
import { verifyCheckoutSignature } from "@/server/billing/razorpay";
import { completePayment } from "@/server/billing/service";

/**
 * Public "Buy" step 2 — Razorpay Checkout's success handler posts the
 * signed result here. A valid signature proves the payment is real and
 * belongs to our order; the account is then created (idempotently — the
 * webhook may have beaten us to it) and the buyer is signed straight in.
 */
export async function POST(request: Request) {
  try {
    const body = checkoutResultSchema.parse(await request.json());

    const valid = verifyCheckoutSignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    if (!valid) {
      throw new AppError("We couldn't verify this payment.", 400);
    }

    const result = await completePayment({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
    });

    if (result.purpose !== "signup") {
      throw new AppError("This payment isn't a new-account purchase.", 400);
    }

    if (result.needsAttention || !result.shopId) {
      return apiSuccess(
        { status: "attention" as const },
        "Payment received — we'll finish setting up your account and contact you shortly.",
      );
    }

    if (result.sessionUserId) {
      await createSession(result.sessionUserId);
      return apiSuccess({ status: "ready" as const }, "Account created");
    }

    return apiSuccess({ status: "signin" as const }, "Account ready — please sign in.");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
