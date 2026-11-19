import { headers } from "next/headers";
import { createSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";
import { findDemoLoginUser } from "@/server/billing/service";

const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");

/**
 * "Try the live demo" — signs the visitor in as the demo shop's owner
 * without a password. Only ever reaches the one shop the super admin has
 * flagged `isDemo`; account-level changes there are blocked by
 * `assertNotDemo`.
 */
export async function POST() {
  try {
    const headerList = await headers();
    const ip = clientIpFromHeaders(headerList.get("x-forwarded-for"), TRUSTED_PROXY_HOPS);
    if (!checkRateLimit(`demo-login:${ip}`, 20, 10 * 60).allowed) {
      throw new AppError("Too many attempts. Please try again in a few minutes.", 429);
    }

    const user = await findDemoLoginUser();
    if (!user) {
      throw AppError.notFound("The demo isn't available right now. Please contact us on WhatsApp.");
    }

    await createSession(user.id);
    return apiSuccess(null, "Welcome to the demo");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
