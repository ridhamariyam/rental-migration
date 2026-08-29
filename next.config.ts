import type { NextConfig } from "next";

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
