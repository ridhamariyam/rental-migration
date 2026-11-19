import Link from "next/link";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown on every dashboard page of the demo shop only: a slim strip
 * reminding the visitor they're looking at sample data, with the way to
 * get an account of their own.
 */
export function DemoUpgradeBanner() {
  return (
    <div className="border-primary/15 bg-primary/[0.06] flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 print:hidden">
      <p className="flex items-start gap-2 text-sm sm:items-center">
        <SparklesIcon className="text-primary mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden="true" />
        <span>
          <span className="font-medium">You&apos;re exploring a live demo</span>
          <span className="text-muted-foreground"> with sample data. Get your own account in minutes.</span>
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 bg-white"
          nativeButton={false}
          render={<Link href="/#pricing">See plans</Link>}
        />
        <Button
          size="sm"
          className="h-8 gap-1.5"
          nativeButton={false}
          render={
            <Link href="/signup">
              Buy now
              <ArrowRightIcon className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />
      </div>
    </div>
  );
}

/** Compact header button for the demo shop — always visible, any width. */
export function DemoUpgradeHeaderButton() {
  return (
    <Button
      size="sm"
      className="h-8 gap-1.5"
      nativeButton={false}
      render={
        <Link href="/signup">
          <SparklesIcon className="size-3.5" aria-hidden="true" />
          <span>
            Get Rentque<span className="hidden sm:inline">: create account</span>
          </span>
        </Link>
      }
    />
  );
}
