import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3Icon,
  BoxesIcon,
  CalendarCheckIcon,
  MapPinIcon,
  MessageCircleIcon,
  ScanBarcodeIcon,
  UsersIcon,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { DemoButton } from "@/components/marketing/demo-button";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { getCurrentUser } from "@/lib/auth/session";
import { whatsappLink } from "@/lib/plans";
import { isDemoAvailable } from "@/server/billing/service";

export const metadata = {
  title: "Rentque — Rental management for bridal & costume businesses",
  description:
    "Inventory, bookings, payments, staff and reports for rental businesses. Try the live demo, then buy a plan in minutes.",
};

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: BoxesIcon,
    title: "Inventory & barcodes",
    body: "Products, sizes and colours, each piece with its own barcode and live status.",
  },
  {
    icon: CalendarCheckIcon,
    title: "Bookings without clashes",
    body: "Availability checked per piece and date, from booking through pickup and return.",
  },
  {
    icon: ScanBarcodeIcon,
    title: "Fast counter work",
    body: "Scan to find an item, take advance and deposit, print the receipt.",
  },
  {
    icon: UsersIcon,
    title: "Staff, attendance & salary",
    body: "Roles per outlet, GPS check-in, leave and payslips worked out for you.",
  },
  {
    icon: MapPinIcon,
    title: "Multiple outlets",
    body: "Run every branch from one account, each with its own team and stock.",
  },
  {
    icon: BarChart3Icon,
    title: "Reports that matter",
    body: "Daily and monthly income, most-rented items, idle stock and staff performance.",
  },
];

export default async function HomePage() {
  // A real (non-demo) signed-in business goes straight to work.
  const user = await getCurrentUser();
  if (user && user.shopId && !user.shopIsDemo) {
    redirect("/dashboard");
  }

  const demoAvailable = await isDemoAvailable();

  return (
    <div className="bg-auth-canvas text-auth-ink flex min-h-full flex-1 flex-col">
      <header className="border-auth-line border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <nav className="flex items-center gap-1 text-sm sm:gap-4">
            <a href="#pricing" className="text-auth-muted hover:text-auth-ink hidden px-2 py-1 sm:inline">
              Pricing
            </a>
            <Link href="/login" className="text-auth-muted hover:text-auth-ink px-2 py-1">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="bg-auth-ink hover:bg-auth-ink/85 rounded-[10px] px-3.5 py-2 font-medium text-white"
            >
              Buy now
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24">
          <p className="text-auth-muted text-[11px] font-medium tracking-[0.18em] uppercase">
            Rental management platform
          </p>
          <h1 className="mt-4 max-w-3xl text-[clamp(2.2rem,6vw,3.75rem)] leading-[1.05] font-medium tracking-[-0.035em] text-balance">
            Run your rental business from one calm screen.
          </h1>
          <p className="text-auth-muted mt-5 max-w-2xl text-[17px] leading-relaxed">
            Inventory, bookings, payments, returns, staff and reports — built for bridal and costume
            rental shops. Explore the live demo with sample data, then buy a plan and start the same
            day.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start">
            {demoAvailable ? <DemoButton /> : null}
            <a
              href="#pricing"
              className="border-auth-line inline-flex h-11 items-center justify-center rounded-[10px] border bg-white px-5 text-[15px] font-medium hover:bg-neutral-50"
            >
              See plans & pricing
            </a>
          </div>
          {demoAvailable ? (
            <p className="text-auth-muted mt-3 text-sm">
              No sign-up needed for the demo — you&apos;re signed in to a sample business.
            </p>
          ) : null}
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-auth-line bg-auth-line sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white p-6">
                <Icon className="text-primary size-5" strokeWidth={1.6} aria-hidden="true" />
                <h2 className="mt-4 text-[15px] font-medium">{title}</h2>
                <p className="text-auth-muted mt-1.5 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="border-auth-line scroll-mt-4 border-t bg-white/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-medium tracking-[-0.03em]">
              Simple pricing
            </h2>
            <p className="text-auth-muted mt-2 max-w-xl">
              Pay securely online. Your account is created the moment payment succeeds — sign straight
              in and start adding your stock.
            </p>
            <div className="mt-10">
              <PricingPlans />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-auth-line border-t">
        <div className="text-auth-muted mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Rentque</span>
          <a
            href={whatsappLink("Hi, I have a question about Rentque.")}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-auth-ink inline-flex items-center gap-1.5"
          >
            <MessageCircleIcon className="size-4" aria-hidden="true" />
            Questions? WhatsApp +91 90372 06737
          </a>
        </div>
      </footer>
    </div>
  );
}
