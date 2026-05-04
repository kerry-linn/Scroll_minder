# ScrollMinder — File-by-File Guide

This document contains a detailed breakdown of every file in the project for internal reference.

## Architecture Detail

### Server / backend

- **`proxy.ts`** — Next.js 16 proxy (the successor to `middleware.ts`). Runs before every non-static request. Refreshes the Supabase auth session (rotates tokens in cookies) and redirects unauthenticated users to `/login` and authenticated users away from auth pages. Skips the `/api/cron` prefix so the cron route can be called with a Bearer token.
- **`app/actions/auth.ts`** — Server Actions for `signIn`, `signUp`, and `signOut`. Calls Supabase Auth and then redirects.
- **`app/actions/tasks.ts`** — Server Actions for `createTask`, `deleteTask`, and `fetchPendingTasks`. Each action re-validates the user session before touching the database. `deleteTask` also removes the associated S3 object when present.
- **`app/actions/attachments.ts`** — Server Actions for S3 operations: `getPresignedUploadUrl` (presigned PUT, 5-minute window), `getPresignedDownloadUrl` (presigned GET, 15-minute window, enforces user ownership), and `deleteS3Object` (best-effort cleanup on task removal).
- **`app/api/cron/due-reminders/route.ts`** — Bearer-protected cron route. Queries pending tasks due in 3 days (low/medium priority) or 5 days (high priority), sends reminder emails via Resend, and records each send in `task_email_reminders` to prevent duplicates.
- **`lib/supabase/server.ts`** — Creates a cookie-aware Supabase client for Server Components and Server Actions.
- **`lib/supabase/middleware.ts`** — Creates a Supabase client scoped to Next.js middleware so it can write refreshed auth cookies back onto the response.
- **`lib/supabase/admin.ts`** — Creates a service-role Supabase client that bypasses RLS. Used only by the cron route to look up user emails via `auth.admin.getUserById`.
- **`supabase/schema.sql`** — Full DDL: `task_priority` / `task_status` enums, `tasks` table (including `attachment_url`, `attachment_s3_key`, `attachment_name`), a composite index on `(user_id, due_date, created_at)`, grants for the `authenticated` role, four RLS policies, and the `task_email_reminders` dedupe table.

### Client / frontend

- **`app/layout.tsx`** — Root HTML shell. Loads Geist fonts, sets global CSS, and renders the `<Toaster />` for toast notifications.
- **`app/page.tsx`** — Home route. Wraps `TasksLoader` in `<Suspense>` so a skeleton renders during the initial server fetch.
- **`app/login/page.tsx`**, **`app/register/page.tsx`** — Thin route pages that render `<AuthForm>` in the appropriate mode.
- **`components/tasks/tasks-loader.tsx`** — Server Component bridge. Calls `fetchPendingTasks()` and passes the result as `initialTasks` to `TasksApp`.
- **`components/tasks/tasks-app.tsx`** — Client Component root. Seeds the Zustand store from `initialTasks` on mount, renders the header, `TaskFeed`, and `TaskCommandBar`.
- **`components/tasks/task-feed.tsx`** — Groups `OptimisticTask[]` by ISO date, renders each group as a section. Delete and complete are both optimistic: row removed immediately from store, re-added on Server Action failure. `AttachmentLink` renders a chip that either opens a URL directly or fetches a presigned GET URL for private S3 objects.
- **`components/tasks/task-command-bar.tsx`** — Sticky input bar at the bottom. Manages title/due-date/priority/attachment state. For file uploads: obtains a presigned PUT URL, PUTs the file directly to S3, then calls `createTask`. For URL attachments: stores the URL directly. Adds an optimistic placeholder row before calling `createTask`, then swaps it for the real row or rolls back on error.
- **`components/tasks/task-feed-skeleton.tsx`** — Placeholder skeleton shown by Suspense while the server fetch is in flight.
- **`components/auth/auth-form.tsx`** — Shared login/register form. Handles client-side validation, calls the appropriate Server Action, and shows toast errors.
- **`components/auth/sign-out-button.tsx`** — Submits a native `<form>` whose `action` is the `signOut` Server Action.
- **`stores/tasks-store.ts`** — Zustand store. Holds `OptimisticTask[]` and exposes `setTasks`, `addOptimisticTask`, `replaceOptimisticTask`, `removeTask`. All mutations re-sort by due date → priority → creation time.
- **`lib/tasks/types.ts`** — Shared TypeScript types: `Task`, `CreateTaskInput`, `OptimisticTask`, `TaskPriority`, `TaskStatus`.
- **`lib/tasks/date-utils.ts`** — `formatDaysRemaining(isoString)`: returns human labels like `"today"`, `"tomorrow"`, `"in 3 days"`, `"2 days ago"` using date-fns.
- **`lib/utils.ts`** — `cn(...classes)`: merges Tailwind class strings via `clsx` + `tailwind-merge`.

### Config files

| File | Purpose |
|---|---|
| `next.config.ts` | Next.js config |
| `tsconfig.json` | Strict TypeScript, `@/*` path alias mapping to repo root |
| `postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` for Tailwind v4 |
| `biome.json` | Biome formatter + linter rules (unused imports/vars as errors, `noConsole` as warning) |
| `knip.json` | Finds unused exports/dependencies, entry point `app/**/*`, ignores `components/ui/**` |
| `vercel.json` | Schedules the `/api/cron/due-reminders` route at 08:00 UTC daily |
| `components.json` | shadcn/ui CLI config (style: base-nova, icon: lucide, aliases) |
| `app/globals.css` | Tailwind imports, `@theme` token mappings, `:root` and `.dark` CSS variable values |

## Project structure

```
calendar-mvp/
├── app/
│   ├── actions/
│   │   ├── attachments.ts    # Server Actions: presigned S3 upload/download/delete
│   │   ├── auth.ts           # Server Actions: signIn, signUp, signOut
│   │   └── tasks.ts          # Server Actions: createTask, deleteTask, fetchPendingTasks
│   ├── api/
│   │   └── cron/
│   │       └── due-reminders/
│   │           └── route.ts  # Cron handler: Resend email reminders
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── auth/
│   │   ├── auth-form.tsx
│   │   └── sign-out-button.tsx
│   ├── tasks/
│   │   ├── task-command-bar.tsx
│   │   ├── task-feed.tsx
│   │   ├── task-feed-skeleton.tsx
│   │   ├── tasks-app.tsx
│   │   └── tasks-loader.tsx
│   └── ui/                   # shadcn/base-ui primitives
│       ├── button.tsx
│       ├── calendar.tsx
│       ├── input.tsx
│       ├── popover.tsx
│       ├── select.tsx
│       ├── skeleton.tsx
│       └── sonner.tsx
├── lib/
│   ├── supabase/
│   │   ├── admin.ts          # Service-role client (cron only)
│   │   ├── middleware.ts     # Supabase client for middleware context
│   │   └── server.ts        # Supabase client for Server Components / Actions
│   ├── tasks/
│   │   ├── date-utils.ts
│   │   └── types.ts
│   └── utils.ts
├── stores/
│   └── tasks-store.ts
├── supabase/
│   └── schema.sql
├── proxy.ts                  # Next.js 16 route guard + auth cookie refresh
├── vercel.json               # Cron schedule for email reminders
├── biome.json
├── components.json
├── knip.json
├── next.config.ts
├── package.json
├── postcss.config.mjs
└── tsconfig.json
```
