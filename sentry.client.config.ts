import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of sessions for Session Replay in production; 100% on error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [Sentry.replayIntegration()],

  // Set to 0 in development to avoid noise; enable in production.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 0,

  // Suppress Sentry SDK logs in the browser console.
  debug: false,
});
