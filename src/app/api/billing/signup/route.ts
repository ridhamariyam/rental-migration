import { headers } from "next/headers";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";
import { signupSchema } from "@/lib/validation/billing";
import { startSignup } from "@/server/billing/service";

const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");

/**
 * Public "Buy" step 1 — validates the business/owner details and opens a
 * Razorpay order. Nothing is provisioned here; see `completePayment`.
 */
export async function POST(request: Request) {
  try {
    const headerList = await headers();
    const ip = clientIpFromHeaders(
      headerList.get("x-forwarded-for"),
      TRUSTED_PROXY_HOPS,
    );
    if (!checkRateLimit(`signup:${ip}`, 10, 10 * 60).allowed) {
      throw new AppError("Too many attempts. Please try again in a few minutes.", 429);
    }

    const body = signupSchema.parse(await request.json());
    const checkout = await startSignup(body);
    return apiSuccess(checkout, "Checkout ready", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
