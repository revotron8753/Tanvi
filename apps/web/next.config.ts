import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// NOTE: 'unsafe-inline' for scripts is a known Phase-1 limitation (Next inline bootstrap scripts).
// Tighten to nonce-based CSP in Phase 7 (tracked in docs/SECURITY.md).
const baseCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

const csp = baseCsp.join("; ");

// Razorpay Checkout needs extra origins on the payment page only. Razorpay does not publish an official CSP list;
// these were chosen from the Checkout script/frame hosts and MUST be verified with a real keyed test (docs/INTEGRATIONS.md).
const payCsp = baseCsp
  .map((d) =>
    d.startsWith("script-src") ? `${d} https://checkout.razorpay.com`
    : d.startsWith("connect-src") ? `${d} https://*.razorpay.com`
    : d.startsWith("img-src") ? `${d} https://*.razorpay.com`
    : d.startsWith("form-action") ? `${d} https://*.razorpay.com`
    : d,
  )
  .concat(["frame-src https://api.razorpay.com https://checkout.razorpay.com"])
  .join("; ");

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { authInterrupts: true, serverActions: { bodySizeLimit: "12mb" } },
  transpilePackages: ["@tanvi/domain", "@tanvi/validation", "@tanvi/ui", "@tanvi/database"],
  serverExternalPackages: ["argon2", "pg", "@prisma/client", "sharp"],
  async headers() {
    return [
      {
        source: "/checkout/pay/:path*",
        headers: [{ key: "Content-Security-Policy", value: payCsp }, ...common],
      },
      {
        source: "/((?!checkout/pay).*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          ...common,
        ],
      },
    ];
  },
};

export default config;
