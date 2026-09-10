import type { ReactNode } from "react";
import { AuthVisualPanel } from "@/components/auth/auth-visual-panel";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * The shell both sign-in screens sit in: a split composition rather than a
 * card floating on a canvas, so the page itself is the layout.
 *
 * 45/55 from `lg` up (the form column stops growing long before the
 * photograph does), an even 50/50 through the tablet range, and a single
 * column below `md`, where the photograph is dropped entirely rather than
 * shrunk into a decorative band above the form.
 *
 * Shared by `/login` and `/admin/login` because the two differ only in
 * their copy — keeping one shell is what stops the platform console from
 * drifting into a second, half-maintained login design.
 */
export function AuthSplitLayout({
  eyebrow,
  title,
  description,
  children,
  footnote,
  capabilities,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footnote: ReactNode;
  capabilities?: ReactNode;
}) {
  return (
    <main className="bg-auth-canvas text-auth-ink grid flex-1 grid-cols-1 md:grid-cols-2 lg:grid-cols-[45fr_55fr]">
      <div className="flex flex-col px-5 py-8 sm:px-10 sm:py-10 lg:px-14 xl:px-20">
        {/* Wordmark, form and capability row share one column, so all three
            keep a common left edge and the group stays optically centred
            rather than hugging the gutter on a very wide display. */}
        <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col">
          <Wordmark />

          {/* flex-1 + centred: the form sits in the optical middle of the
              column at any height, instead of hanging under the wordmark
              with an ocean of space beneath it. */}
          <div className="flex flex-1 flex-col justify-center py-10 sm:py-14">
            <p className="text-auth-muted text-[11px] font-medium tracking-[0.18em] uppercase">
              {eyebrow}
            </p>

            <h1 className="mt-4 text-[clamp(1.9rem,6vw,2.75rem)] leading-[1.08] font-medium tracking-[-0.03em] text-balance">
              {title}
            </h1>

            <p className="text-auth-muted mt-3 text-[16px] leading-relaxed">
              {description}
            </p>

            <div className="mt-9">{children}</div>

            <hr className="border-auth-line mt-8 border-t" />

            <p className="text-auth-muted mt-5 text-[13px] leading-relaxed">
              {footnote}
            </p>
          </div>

          {capabilities}
        </div>
      </div>

      <AuthVisualPanel />
    </main>
  );
}
