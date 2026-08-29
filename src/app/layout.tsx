import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Satisfy } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const satisfy = Satisfy({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-script",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rentique",
  description: "Bridal rental management",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${satisfy.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/*
          THESIS: A quiet, precise operations console for a bridal-rental
          business — clarity and speed for staff at a counter, not a
          marketing showcase.
          OWN-WORLD: shadcn/ui base-nova, neutral surface (white/slate) with
          one brand teal accent (#009675 / oklch ~0.6 0.118 174) reserved
          for primary actions, focus, and current-state; Geist throughout;
          tight type scale; Restrained color per Operate mode; light mode
          only.
          STORY: An authenticated operator opens a task, signs in without
          friction, reaches exactly the tool they need — no decoration
          between them and the work.
          FORM: Restrained/Operate default; code-led (no comp round) per
          PRODUCT.md and .impeccable/config.local.json.
          FINISH: unreviewed and undocumented is unfinished; this build ends
          with the finish review, the verdict, DESIGN.md, and every shipping
          raster carrying its provenance.
        */}
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
