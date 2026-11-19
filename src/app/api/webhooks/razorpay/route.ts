import { NextResponse } from "next/server";
import { settleGatewayPayment, verifyWebhookSignature } from "@/server/billing/razorpay";
import { completePayment, markPaymentFailed } from "@/server/billing/service";

type PaymentEntity = { id?: string; order_id?: string; error_description?: string };

/**
 * Razorpay webhook (payment.captured, order.paid, payment.failed). The
 * backstop for a buyer who pays and then closes the tab before the
 * browser-side verify call runs — the account still gets created.
 * Signature-checked against the raw body; anything unsigned is a 400.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      event?: string;
      payload?: { payment?: { entity?: PaymentEntity } };
    };
    const payment = event.payload?.payment?.entity;

    if (payment?.id && payment.order_id) {
      if (event.event === "payment.captured" || event.event === "order.paid") {
        await settleGatewayPayment({ orderId: payment.order_id, paymentId: payment.id });
        await completePayment({ orderId: payment.order_id, paymentId: payment.id });
      } else if (event.event === "payment.failed") {
        await markPaymentFailed(
          payment.order_id,
          payment.error_description ?? "Payment failed",
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // An order we never created (e.g. another integration on the same
    // Razorpay account) is acknowledged, not retried forever.
    if (error instanceof Error && error.message === "Payment not found") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    console.error("Razorpay webhook failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
