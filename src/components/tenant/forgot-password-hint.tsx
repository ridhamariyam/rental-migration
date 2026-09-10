"use client";

import { useState } from "react";

/**
 * "Forgot password?" on a product with no self-service password reset.
 *
 * Tenant accounts are provisioned by a platform administrator and reset the
 * same way (`mustChangePassword` -> `/reset-password`), so there is no
 * route this could link to. Rather than omit the affordance people look
 * for — or link them somewhere that 404s — it answers the question in
 * place, as a disclosure.
 */
export function ForgotPasswordHint() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="forgot-password-hint"
        className="text-auth-muted hover:text-auth-ink focus-visible:ring-ring/50 rounded-sm text-[13px] underline-offset-4 transition-colors outline-none hover:underline focus-visible:ring-3"
      >
        Forgot password?
      </button>

      {open ? (
        <p
          id="forgot-password-hint"
          className="border-auth-line text-auth-muted w-full rounded-[10px] border bg-white px-3.5 py-3 text-left text-[13px] leading-relaxed"
        >
          Ask your platform administrator to reset it. They will set a temporary
          password, and you&rsquo;ll choose a new one the next time you sign in.
        </p>
      ) : null}
    </div>
  );
}
