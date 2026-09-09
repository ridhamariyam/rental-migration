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
    // Uploads now live in this project's Railway bucket and are served
    // same-origin from `/api/files/...` (see src/lib/storage.ts), which
    // needs no `remotePatterns` entry. The Cloudinary pattern stays only
    // so images uploaded before that move still render from the absolute
    // URLs already stored on those rows.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
