# ScrollMinder

A minimalist personal task manager built with Next.js 16, Supabase, and Tailwind CSS. Users sign up, log in, and manage a chronological feed of pending tasks with due dates and priorities.

## Features

- Email/password authentication via Supabase Auth
- Create tasks with a title, due date, and priority (low / medium / high)
- Delete tasks with optimistic UI (instant feedback, rollback on error)
- Tasks grouped by due date with relative labels ("today", "in 3 days", etc.)
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
                                ├── TaskFeed     (reads Zustand store)
                                └── TaskCommandBar (writes via Server Actions → Supabase)
```

For a detailed file-by-file breakdown, see [FILES.md](./FILES.md).

---

## Local setup

### 1. Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

### 2. Environment variables

Create `.env.local` in the `calendar-mvp` directory:

```env
# ── Supabase (required) ─────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# ── Email reminders (required for due-date reminders) ───────────────────────
# Service role key — bypasses RLS so the cron can read all users' tasks.
# NEVER expose this in client code or commit it to version control.
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Resend API key — https://resend.com/api-keys
RESEND_API_KEY=re_<your-resend-key>

# The "from" address Resend will send reminders from (must be a verified domain).
REMINDER_FROM_EMAIL=reminders@yourdomain.com

# A random secret used to authenticate the Vercel Cron request.
# Generate with: openssl rand -hex 32
REMINDER_CRON_SECRET=<random-secret>
```

The first two values are in your Supabase project under **Settings → API**. The service role key is on the same page under **Project API keys → service_role**.

### 3. Database schema

In your Supabase project open **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql). This creates:

- `task_priority` and `task_status` enums
- `tasks` table with RLS enabled
- A composite index for the chronological feed query
- Four RLS policies (one per operation) scoped to `auth.uid() = user_id`

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
2. Create or update `vercel.json` in `calendar-mvp`:

```json
{
  "crons": [
    {
      "path": "/api/cron/due-reminders",
      "schedule": "0 8 * * *"
    }
  ]
}
```

3. Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET` when you set `CRON_SECRET` in the dashboard — or pass it manually via `REMINDER_CRON_SECRET`.

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
| `knip` | `knip` | Find unused exports and dependencies |

---

