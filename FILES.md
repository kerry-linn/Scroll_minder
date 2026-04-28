# ScrollMinder - File-by-File Guide

This document contains a detailed breakdown of every file in the project for internal reference.

## Architecture Detail

### Server / backend

- **`proxy.ts`** — Next.js 16 proxy (the successor to `middleware.ts`). Runs before every non-static request. Refreshes the Supabase auth session (rotates tokens in cookies) and redirects unauthenticated users to `/login` and authenticated users away from auth pages.
- **`app/actions/auth.ts`** — Server Actions for `signIn`, `signUp`, and `signOut`. Calls Supabase Auth and then redirects.
- **`app/actions/tasks.ts`** — Server Actions for `createTask`, `deleteTask`, and `fetchPendingTasks`. Each action re-validates the user session before touching the database.
- **`lib/supabase/server.ts`** — Creates a cookie-aware Supabase client for Server Components and Server Actions. Reads `NEXT_PUBLIC_SUPABASE_URL` and the anon key from environment variables.
- **`lib/supabase/middleware.ts`** — Creates a Supabase client scoped to Next.js middleware so it can write refreshed auth cookies back onto the response.
- **`supabase/schema.sql`** — Full DDL: `task_priority` / `task_status` enums, `tasks` table, a composite index on `(user_id, due_date, created_at)`, grants for the `authenticated` role, and four RLS policies (select / insert / update / delete own rows only).

### Client / frontend

- **`app/layout.tsx`** — Root HTML shell. Loads Geist fonts, sets global CSS, and renders the `<Toaster />` for toast notifications.
- **`app/page.tsx`** — Home route. Wraps `TasksLoader` in `<Suspense>` so a skeleton renders during the initial server fetch.
- **`app/login/page.tsx`**, **`app/register/page.tsx`** — Thin route pages that render `<AuthForm>` in the appropriate mode.
- **`components/tasks/tasks-loader.tsx`** — Server Component bridge. Calls `fetchPendingTasks()` and passes the result as `initialTasks` to `TasksApp`.
- **`components/tasks/tasks-app.tsx`** — Client Component root. Seeds the Zustand store from `initialTasks` on mount, renders the header, `TaskFeed`, and `TaskCommandBar`.
- **`components/tasks/task-feed.tsx`** — Groups `OptimisticTask[]` by ISO date, renders each group as a section. Delete is optimistic: row removed immediately from store, re-added on Server Action failure.
- **`components/tasks/task-command-bar.tsx`** — Sticky input bar at the bottom. Manages title/due-date/priority state, adds an optimistic placeholder row before calling `createTask`, then swaps it for the real row or rolls back on error.
- **`components/tasks/task-feed-skeleton.tsx`** — Placeholder skeleton shown by Suspense while the server fetch is in flight.
- **`components/auth/auth-form.tsx`** — Shared login/register form. Handles client-side validation, calls the appropriate Server Action, and shows toast errors.
- **`components/auth/sign-out-button.tsx`** — Submits a native `<form>` whose `action` is the `signOut` Server Action (no JS required for the sign-out path).
- **`stores/tasks-store.ts`** — Zustand store. Holds `OptimisticTask[]` and exposes `setTasks`, `addOptimisticTask`, `replaceOptimisticTask`, `removeTask`. All mutations re-sort by due date then creation time.
- **`lib/tasks/types.ts`** — Shared TypeScript types: `Task`, `CreateTaskInput`, `OptimisticTask`, `TaskPriority`, `TaskStatus`.
- **`lib/tasks/date-utils.ts`** — `formatDaysRemaining(isoString)`: returns human labels like `"today"`, `"tomorrow"`, `"in 3 days"`, `"2 days ago"` using date-fns.
- **`lib/utils.ts`** — `cn(...classes)`: merges Tailwind class strings via `clsx` + `tailwind-merge`.

### Config files

| File | Purpose |
|---|---|
| `next.config.ts` | Next.js config (no overrides needed for deployment) |
| `tsconfig.json` | Strict TypeScript, `@/*` path alias mapping to repo root |
| `postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` for Tailwind v4 |
| `biome.json` | Biome formatter + linter rules (unused imports/vars as errors, `noConsole` as warning) |
| `knip.json` | Finds unused exports/dependencies, entry point `app/**/*`, ignores `components/ui/**` |
| `components.json` | shadcn/ui CLI config (style: base-nova, icon: lucide, aliases) |
| `app/globals.css` | Tailwind imports, `@theme` token mappings, `:root` and `.dark` CSS variable values |

## Project structure

```
calendar-mvp/
├── app/
│   ├── actions/
│   │   ├── auth.ts           # Server Actions: signIn, signUp, signOut
│   │   └── tasks.ts          # Server Actions: createTask, deleteTask, fetchPendingTasks
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
├── biome.json
├── components.json
├── knip.json
├── next.config.ts
├── package.json
├── postcss.config.mjs
└── tsconfig.json
```
