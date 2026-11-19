import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkoutResultSchema } from "@/lib/validation/billing";
import { settleGatewayPayment, verifyCheckoutSignature } from "@/server/billing/razorpay";
import { completePayment } from "@/server/billing/service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.shopId) throw AppError.unauthorized("Sign-in required");

    const body = checkoutResultSchema.parse(await request.json());
    const valid = verifyCheckoutSignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    if (!valid) throw new AppError("We couldn't verify this payment.", 400);

    // Confirm the money is really captured, in full, before activating.
    await settleGatewayPayment({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
    });

    const result = await completePayment({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
    });

    if (result.purpose !== "renewal" || result.shopId !== user.shopId) {
      throw AppError.forbidden("This payment belongs to a different account");
    }

    return apiSuccess(null, "Subscription renewed");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
