import type { NextConfig } from "next";

// Every "today"/attendance-day boundary in this app (`toDateString(new
// Date())` in attendance/bookings/reports) uses `Date`'s *local* getters,
// deliberately assuming local time == this India-only business's own IST
// day — which only holds if the server process's timezone is actually
// IST. Left unset, that's whatever the host/container defaults to (often
// UTC in prod), silently shifting early-morning check-ins/bookings onto
// the wrong calendar day. Pinning it here, before anything else in the
// process runs, makes it explicit and host-independent.
process.env.TZ = "Asia/Kolkata";

const nextConfig: NextConfig = {
  images: {
    // Product/variation cover images are uploaded straight to Cloudinary
    // (see src/lib/cloudinary.ts) — every `next/image` usage of one
    // currently also passes `unoptimized`, so this isn't load-bearing yet,
    // but it's the correct config to have in place regardless.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
