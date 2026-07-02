# ScrollMinder

A personal task manager — add tasks with due dates, priorities, and file attachments. Receive email reminders before things are due.

## Tech stack

Next.js 16 (App Router) · TypeScript 5 · Tailwind CSS v4 · Supabase · AWS S3 · Resend · Upstash Redis · Sentry

---

## Local setup

### 1. Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- An AWS S3 bucket
- A [Resend](https://resend.com) account
- An [Upstash](https://upstash.com) Redis database (optional — rate limiting is skipped when unset)
- A [Sentry](https://sentry.io) project (optional — errors are silently dropped when DSN is unset)

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in every value.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for cron route |
| `AWS_REGION` | Yes | S3 bucket region (e.g. `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | Yes | IAM key with S3 read/write |
| `AWS_SECRET_ACCESS_KEY` | Yes | IAM secret |
| `AWS_S3_BUCKET_NAME` | Yes | S3 bucket name |
| `RESEND_API_KEY` | Yes | Resend API key for reminder emails |
| `REMINDER_FROM_EMAIL` | Yes | Verified sender address in Resend |
| `REMINDER_CRON_SECRET` | Yes | Bearer token for the cron route |
| `ATTACHMENT_SCAN_CALLBACK_SECRET` | No | Bearer token for the scan callback route (only needed when an external scanner is configured) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN — omit to disable error capture |
| `SENTRY_AUTH_TOKEN` | No | Sentry token for source-map uploads |
| `SENTRY_ORG` | No | Sentry organisation slug |
| `SENTRY_PROJECT` | No | Sentry project slug |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis token |

### 3. Database schema

In your Supabase project open **SQL Editor** and run `supabase/schema.sql`. This creates the `tasks` and `task_email_reminders` tables with row-level security enabled.

### 4. Install and run

```bash
cd calendar-mvp
npm install
npm run dev   # http://127.0.0.1:3000
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run typecheck` | TypeScript check |
| `npm run check` | Biome lint + format check |
| `npm run format` | Auto-format all files |
| `npm run knip` | Find unused exports and dependencies |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Tests with coverage report |

---

## Email reminders (Vercel Cron)

`vercel.json` schedules the cron route at **08:00 UTC** daily. Add all environment variables to Vercel under **Settings → Environment Variables** before deploying.

| Priority | Reminder sent when due in |
|---|---|
| `high` | 5 calendar days |
| `medium` / `low` | 3 calendar days |

---

## Attachment malware scanning

S3 file attachments are gated by a scan status (`pending → clean | infected | error`). A file is inaccessible until the scan completes.

### How it works

1. The client uploads the file directly to S3 via a presigned PUT URL.
2. `createTask` sets `attachment_scan_status = 'pending'` for any S3 attachment.
3. The UI shows a "Scanning…" spinner until the status changes.
4. `getPresignedDownloadUrl` (server action) rejects download attempts for non-clean attachments.
5. An external scanner (see below) POSTs the verdict to `/api/attachments/scan-callback` when the scan finishes.
6. The callback route updates the task row; infected files are also deleted from S3.

### Callback route

`POST /api/attachments/scan-callback`

Protected by `Authorization: Bearer <ATTACHMENT_SCAN_CALLBACK_SECRET>`.

```json
{
  "s3_key": "user-id/uuid-filename.pdf",
  "verdict": "clean",
  "task_id": "optional-uuid",
  "reason": "optional human-readable detail"
}
```

Accepted `verdict` values: `clean` / `NO_THREATS_FOUND` → `clean`; `infected` / `THREATS_FOUND` → `infected`; anything else → `error`.

The callback route is scanner-agnostic — any external process that can make an authenticated HTTP POST can drive it.

### External scanner (deferred)

Wiring an external malware scanner (e.g. a ClamAV Lambda function triggered by an S3 `ObjectCreated` event) is planned but not yet implemented. Until a scanner is deployed, uploaded files will remain in the `pending` state and cannot be downloaded.

Reference handlers for ClamAV and GuardDuty are available in `examples/aws/` for future use. This integration may be revisited in a later release.

---

## CI

GitHub Actions runs typecheck, Biome, unit tests, and a production build on every push and pull request to `main`. See `.github/workflows/ci.yml`.
