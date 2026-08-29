import { headers } from "next/headers";
import { createAdminSession } from "@/lib/auth/admin-session";
import { verifySuperAdminCredentials } from "@/lib/auth/super-admin";
import { adminLoginSchema } from "@/lib/validation/admin-auth";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 5 * 60;

async function clientIp(): Promise<string> {
  const headerList = await headers();
  // Trust only the first hop's own view in this MVP (no reverse-proxy/CDN
  // chain to parse yet) — good enough to slow down a brute force, not
  // meant to be spoof-proof.
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  try {
    const ip = await clientIp();
    const rateLimit = checkRateLimit(
      `admin-login:${ip}`,
      LOGIN_ATTEMPT_LIMIT,
      LOGIN_ATTEMPT_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      throw new AppError(
        "Too many sign-in attempts. Please try again in a few minutes.",
        429,
      );
    }

    const body = adminLoginSchema.parse(await request.json());

    if (!verifySuperAdminCredentials(body.email, body.password)) {
      // Same message regardless of which field was wrong — never confirm
      // whether an email exists.
      throw AppError.unauthorized("Invalid email or password");
    }

    await createAdminSession();

    return apiSuccess(null, "Signed in successfully");
  } catch (error) {
    return apiError(error);
  }
}

// Route handler needs the caller's IP per request; opt out of any caching.
export const dynamic = "force-dynamic";
