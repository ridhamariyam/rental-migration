import { headers } from "next/headers";
import { createAdminSession } from "@/lib/auth/admin-session";
import { verifySuperAdminCredentials } from "@/lib/auth/super-admin";
import { adminLoginSchema } from "@/lib/validation/admin-auth";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  checkRateLimit,
  clearRateLimit,
  clientIpFromHeaders,
} from "@/lib/security/rate-limit";

/** Hops the platform appends in front of the client. Railway adds one. */
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");

/** Per-account attempts are stricter than per-IP: a spray across many
 * addresses at one account is the case an IP-only limiter misses. */
const ACCOUNT_ATTEMPT_LIMIT = 5;

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 5 * 60;

async function clientIp(): Promise<string> {
  const headerList = await headers();
  // Read the hop the trusted proxy actually observed, not the first entry
  // of a chain the caller can prepend to — that made the limiter
  // bypassable with a single header (RQ-14).
  return clientIpFromHeaders(
    headerList.get("x-forwarded-for"),
    TRUSTED_PROXY_HOPS,
  );
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

    const accountKey = `admin-login:account:${body.email.toLowerCase()}`;
    const accountLimit = checkRateLimit(
      accountKey,
      ACCOUNT_ATTEMPT_LIMIT,
      LOGIN_ATTEMPT_WINDOW_SECONDS,
    );
    if (!accountLimit.allowed) {
      throw new AppError(
        "Too many sign-in attempts for this account. Please try again in a few minutes.",
        429,
      );
    }

    if (!verifySuperAdminCredentials(body.email, body.password)) {
      // Same message regardless of which field was wrong — never confirm
      // whether an email exists.
      throw AppError.unauthorized("Invalid email or password");
    }

    clearRateLimit(accountKey);
    clearRateLimit(`admin-login:${ip}`);

    await createAdminSession();

    return apiSuccess(null, "Signed in successfully");
  } catch (error) {
    return apiError(error);
  }
}

// Route handler needs the caller's IP per request; opt out of any caching.
export const dynamic = "force-dynamic";
