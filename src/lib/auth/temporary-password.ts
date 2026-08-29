import "server-only";

import { randomInt } from "node:crypto";
import { passwordPolicyIssues } from "@/lib/auth/password-policy";

// Excludes visually-ambiguous characters (0/O, 1/l/I) since this is read
// off a screen and typed by hand at least once during handover.
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const LENGTH = 14;

/**
 * A cryptographically random temporary password for a newly-provisioned
 * tenant admin, guaranteed to satisfy the same policy every other password
 * in the app is held to (`passwordPolicyIssues`) — regenerated in the
 * (astronomically unlikely) case a random draw doesn't happen to contain
 * all three character classes. Never logged; the caller is responsible for
 * only ever returning it once, in the creation response.
 */
export function generateTemporaryPassword(): string {
  for (;;) {
    let password = "";
    for (let i = 0; i < LENGTH; i += 1) {
      password += CHARSET[randomInt(CHARSET.length)];
    }
    if (passwordPolicyIssues(password).length === 0) {
      return password;
    }
  }
}
