import Image from "next/image";

/**
 * The editorial half of the split sign-in screen.
 *
 * It carries a photograph of the business this software runs — a boutique
 * rail of bridal wear in warm light. The gradient layers beneath it are a
 * self-sufficient fallback (dim boutique warmth, a light bloom, the faint
 * vertical rhythm of garments on a rail), so a missing or slow-loading
 * file degrades to something finished rather than to a blank rectangle.
 *
 * The source is a ~2 MB PNG, so it goes through `next/image` rather than a
 * CSS background: that serves a resized AVIF/WebP a fraction of the size,
 * and `sizes` tells it never to fetch anything for the phone layout, where
 * the panel is not rendered at all.
 *
 * Hidden below `md`: on a phone this would be a band of decoration between
 * someone and the form they came to fill in.
 */
const PHOTOGRAPH_URL = "/brand/loginpage.png";

const FEATURES = [
  {
    title: "Stay organized",
    description: "Manage your inventory with ease.",
  },
  {
    title: "Save time",
    description: "Handle bookings effortlessly.",
  },
  {
    title: "Grow your business",
    description: "Get paid and track everything in one place.",
  },
];

export function AuthVisualPanel() {
  return (
    <section
      aria-hidden="true"
      className="relative hidden overflow-hidden bg-[#2b2320] md:block"
    >
      {/* Fallback ground: dim warm boutique light, top-left bloom. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(80% 55% at 26% 12%, rgba(247,225,196,0.5) 0%, rgba(247,225,196,0) 68%), radial-gradient(70% 50% at 88% 42%, rgba(197,150,112,0.28) 0%, rgba(197,150,112,0) 70%), linear-gradient(168deg, #4a3b32 0%, #5d4a3d 38%, #2a2119 100%)",
        }}
      />
      {/* The faint vertical rhythm of garments hanging on a rail. */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(92deg, rgba(255,246,233,0.035) 0px, rgba(255,246,233,0.02) 34px, rgba(0,0,0,0.045) 78px, rgba(0,0,0,0.02) 132px)",
        }}
      />
      {/* Framed a little right of centre: the rail of lehengas is the most
          characteristic thing in the shot, and a straight centre crop on a
          tall panel pushes it out of frame. */}
      <Image
        src={PHOTOGRAPH_URL}
        alt=""
        fill
        priority
        sizes="(max-width: 767px) 0px, 55vw"
        className="object-cover object-[62%_center]"
      />
      {/* Readability scrim — weighted to the bottom half, where the copy
          sits. It has to hold up over the brightest thing in the shot: a
          cream lehenga lit by the window, directly behind the feature list. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(20,16,14,0.90) 0%, rgba(20,16,14,0.76) 30%, rgba(20,16,14,0.46) 55%, rgba(20,16,14,0.14) 80%, rgba(20,16,14,0.24) 100%)",
        }}
      />

      <div className="relative flex h-full flex-col justify-end p-10 lg:p-14 xl:p-16">
        <div className="max-w-[34rem]">
          <p className="text-[11px] font-medium tracking-[0.18em] text-white/70 uppercase">
            Inventory • Bookings • Payments
          </p>

          <h2 className="mt-5 text-[clamp(1.75rem,2.4vw,2.375rem)] leading-[1.15] font-medium tracking-[-0.02em] text-balance text-white">
            Everything your rental business needs, in one place.
          </h2>

          <p className="mt-4 max-w-[30rem] text-[15px] leading-relaxed text-white/75">
            Manage inventory, bookings, customers and payments from a single
            workspace.
          </p>

          <ul className="mt-10 flex flex-col">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="flex flex-col gap-0.5 border-t border-white/15 py-4 last:pb-0 lg:flex-row lg:items-baseline lg:gap-6"
              >
                <span className="text-[14px] font-medium text-white lg:w-[10.5rem] lg:shrink-0">
                  {feature.title}
                </span>
                <span className="text-[14px] text-white/65">
                  {feature.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
