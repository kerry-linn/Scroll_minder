import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  // Suppress verbose build output from the Sentry webpack plugin.
  silent: !process.env.CI,

  // Upload source maps to Sentry so stack traces de-minify in the dashboard.
  // Requires SENTRY_AUTH_TOKEN to be set (see .env.example).
  widenClientFileUpload: true,

  // Tree-shake Sentry debug code from client bundles.
  disableLogger: true,

  // Automatically instrument Next.js pages/routes (Server Component wrappers).
  autoInstrumentServerFunctions: true,
});
