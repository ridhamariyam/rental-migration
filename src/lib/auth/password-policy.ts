/**
 * Shared password policy, enforced identically in Zod schemas (server
 * boundary) and form validation (client). Kept here — not duplicated — so
 * the two can never drift.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 100;

/**
 * Distinct, lower floor for the env-sourced super admin credential (see
 * `src/lib/env.ts` and `src/lib/validation/admin-auth.ts`) — not the
 * creation policy above, which governs passwords *set through the app*.
 * Shared here so the client-side login schema can reject "too short to ever
 * be valid" input before it's ever sent to the backend, without the two
 * numbers being able to drift apart.
 */
export const SUPER_ADMIN_PASSWORD_MIN_LENGTH = 8;

export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(`Must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) {
    issues.push("Must contain a lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("Must contain an uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    issues.push("Must contain a number");
  }

  return issues;
}
