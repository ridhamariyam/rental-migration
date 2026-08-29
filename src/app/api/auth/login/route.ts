import { headers } from "next/headers";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { loginSchema } from "@/lib/validation/auth";
import { loginTenantUser } from "@/server/auth/service";

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 5 * 60;

async function clientIp(): Promise<string> {
  const headerList = await headers();
  // Same caveat as the admin login route: trusts only the first hop's own
  // view (no reverse-proxy/CDN chain to parse yet) — good enough to slow
  // down a brute force, not meant to be spoof-proof.
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  try {
    const ip = await clientIp();
    const rateLimit = checkRateLimit(
      `tenant-login:${ip}`,
      LOGIN_ATTEMPT_LIMIT,
      LOGIN_ATTEMPT_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      throw new AppError(
        "Too many sign-in attempts. Please try again in a few minutes.",
        429,
      );
    }

    const body = loginSchema.parse(await request.json());
    const result = await loginTenantUser(body.email, body.password);

    return apiSuccess(result, "Signed in successfully");
  } catch (error) {
    return apiError(error);
  }
}

// Route handler needs the caller's IP per request; opt out of any caching.
export const dynamic = "force-dynamic";
