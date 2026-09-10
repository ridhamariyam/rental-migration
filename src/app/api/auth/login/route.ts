import { headers } from "next/headers";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  checkRateLimit,
  clearRateLimit,
  clientIpFromHeaders,
} from "@/lib/security/rate-limit";
import { loginSchema } from "@/lib/validation/auth";
import { loginTenantUser } from "@/server/auth/service";

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

    // Per-account limiting as well as per-IP: a spray from many addresses
    // at one account slips past an IP-only counter.
    const accountKey = `tenant-login:account:${body.email.toLowerCase()}`;
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

    const result = await loginTenantUser(body.email, body.password);

    // A successful sign-in clears both counters, so someone who mistyped
    // their password twice isn't still being counted afterwards.
    clearRateLimit(accountKey);
    clearRateLimit(`tenant-login:${ip}`);

    return apiSuccess(result, "Signed in successfully");
  } catch (error) {
    return apiError(error);
  }
}

// Route handler needs the caller's IP per request; opt out of any caching.
export const dynamic = "force-dynamic";
