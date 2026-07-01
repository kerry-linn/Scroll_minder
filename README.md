# ScrollMinder

A minimalist personal task manager built with Next.js 16, Supabase, and Tailwind CSS. Users sign up, log in, and manage a chronological feed of pending tasks with due dates, priorities, and file attachments.

## Features

- Email/password authentication via Supabase Auth
- Create tasks with a title, due date, priority (low / medium / high), and an optional attachment (file upload to S3 or pasted URL)
- Delete tasks with optimistic UI (instant feedback, rollback on error)
- Complete tasks via green check or long-press (removes from the pending feed)
- Uploaded S3 files are deleted automatically when the task is removed
- Tasks grouped by due date with relative labels ("today", "in 3 days", etc.)
- Sorted by due date → priority → creation time
- Cron-driven email reminders via Resend (3 days ahead for low/medium, 5 days for high priority)
- Row-level security: each user can only access their own tasks
- Sticky bottom command bar for fast task entry

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS v4, shadcn/ui (Base Nova style), tw-animate-css |
| UI primitives | Base UI (`@base-ui/react`), Lucide icons |
| Date handling | date-fns, react-day-picker |
| Client state | Zustand 5 |
| Backend / Auth | Supabase (Postgres + Auth + RLS) |
| File storage | AWS S3 (presigned PUT/GET URLs) |
| Email | Resend |
| Toast notifications | Sonner |
| Linter / formatter | Biome |
| Dead code detection | Knip |

---

## Architecture

```
Browser
  └── proxy.ts               ← auth guard, Supabase cookie refresh (runs on every request)
        ├── /login, /register  (public)
        └── /                  (protected)
              └── app/page.tsx (Server Component)
                    └── TasksLoader (Server Component, fetches tasks)
                          └── TasksApp (Client Component, hydrates Zustand)
                                ├── TaskFeed       (reads Zustand store)
                                └── TaskCommandBar (writes via Server Actions → Supabase + S3)
```

For a detailed file-by-file breakdown, see [FILES.md](./FILES.md).

---

## Local setup

### 1. Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- An AWS S3 bucket (for file attachments)
- A [Resend](https://resend.com) account (for email reminders)

### 2. Environment variables

Create `.env.local` in the `calendar-mvp` directory:

```env
# ── Supabase (required) ─────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Service role key — bypasses RLS so the cron can read all users' tasks.
# NEVER expose this in client code or commit it to version control.
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# ── AWS S3 (required for file attachments) ──────────────────────────────────
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-secret-access-key>
AWS_S3_BUCKET_NAME=<your-bucket-name>

# ── Email reminders (required for due-date reminders) ───────────────────────
# Resend API key — https://resend.com/api-keys
RESEND_API_KEY=re_<your-resend-key>

# The "from" address Resend will send reminders from (must be a verified domain).
REMINDER_FROM_EMAIL=reminders@yourdomain.com

# A random secret used to authenticate the Vercel Cron request.
# Generate with: openssl rand -hex 32
REMINDER_CRON_SECRET=<random-secret>
```

The first two Supabase values are in your project under **Settings → API**. The service role key is on the same page under **Project API keys → service_role**.

### 3. Database schema

In your Supabase project open **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql). This creates:

- `task_priority` and `task_status` enums
- `tasks` table with all columns (including `attachment_url`, `attachment_s3_key`, `attachment_name`) and RLS enabled
- A composite index for the chronological feed query
- Four RLS policies (one per operation) scoped to `auth.uid() = user_id`
- `task_email_reminders` table for cron deduplication

### 4. Install and run

```bash
cd calendar-mvp
npm install
npm run dev       # http://127.0.0.1:3000
```

---

## Email reminders (Vercel Cron)

The cron route at `/api/cron/due-reminders` sends one reminder email per task per threshold:

| Priority | Reminder sent when due in |
|---|---|
| `high` | 5 calendar days |
| `medium` / `low` | 3 calendar days |

**Setup steps:**

1. Add the environment variables above to Vercel (Settings → Environment Variables).
2. The [`vercel.json`](vercel.json) in this directory schedules the cron at 08:00 UTC daily and passes `Authorization: Bearer $REMINDER_CRON_SECRET` automatically.

---

## Scripts

| Script | Command | What it does |
|---|---|---|
| `dev` | `next dev -H 127.0.0.1` | Start dev server (Turbopack) |
| `build` | `next build` | Production build |
| `start` | `next start` | Serve production build locally |
| `lint` | `biome lint .` | Biome lint check |
| `format` | `biome format --write .` | Auto-format all files |
| `check` | `biome check .` | Lint + format check combined |
| `typecheck` | `tsc --noEmit` | TypeScript type check |
| `test` | `vitest run` | Run unit/integration tests |
| `test:watch` | `vitest` | Watch mode for tests |
| `test:coverage` | `vitest run --coverage` | Test coverage report |
| `knip` | `knip` | Find unused exports and dependencies |

---
