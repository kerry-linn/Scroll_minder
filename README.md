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

---

## Concepts to understand

### Next.js App Router
Files inside `app/` are Server Components by default. Add `"use client"` only when you need browser APIs or React hooks. Server Components can be `async` and `await` data directly.

### Server Actions
Functions marked `"use server"` run exclusively on the server. You call them from client components like regular async functions — Next.js handles the RPC boundary. Because they run on the server, they can safely use cookies, access Supabase, and call `redirect()`.

### Supabase SSR auth
Supabase stores the session in cookies so it works in Server Components and middleware (no `localStorage`). `@supabase/ssr` provides `createServerClient`, which reads/writes cookies on every request. The `middleware.ts` file refreshes the session on every request; without it, tokens silently expire.

### Row-level security (RLS)
Postgres policies on the `tasks` table enforce that `auth.uid() = user_id`. Even if an API call is mis-scoped, the database itself rejects cross-user access. The `authenticated` role grant means anon requests get no table access at all.

### Optimistic UI
When a user adds or deletes a task, the UI reflects the change immediately (via Zustand) before the Server Action resolves. If the action fails, the store rolls back. This pattern keeps the UI feeling fast while ensuring server state is always the source of truth.

### Zustand
A lightweight state manager for React. This app uses a single `useTasksStore` hook. The store is a module-level singleton on the client — no Provider required. It holds the task list and exposes discrete mutation functions rather than exposing a raw setter.

---

## Local setup

### 1. Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

### 2. Environment variables

Create `.env.local` in the `calendar-mvp` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Both values are in your Supabase project under **Settings → API**.

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

> The dev server binds to `127.0.0.1` (localhost only). To access from another device on your network change the `-H` flag in the `dev` script in `package.json`.

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

## Deploying to Vercel

### 1. Push to GitHub (or GitLab / Bitbucket)

Vercel imports directly from a Git remote. If deploying from the `Scroll_minder` parent folder, you will set the **Root Directory** to `calendar-mvp` in step 3.

### 2. Create a new Vercel project

Go to [vercel.com/new](https://vercel.com/new), click **Add New Project**, and import your repository.

### 3. Configure the project

| Setting | Value |
|---|---|
| **Root Directory** | `calendar-mvp` (if repo root is `Scroll_minder`) |
| **Framework Preset** | Next.js (auto-detected) |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `.next` (default) |

### 4. Add environment variables

In the Vercel project settings under **Environment Variables**, add:

```
NEXT_PUBLIC_SUPABASE_URL     = https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <your-anon-key>
```

Set these for **Production**, **Preview**, and **Development** environments as needed.

### 5. Run the database schema

Make sure you have run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase project before the first deployment. The app will build without it, but every page load will return empty data and all write actions will fail.

### 6. Deploy

Click **Deploy**. Vercel builds with `npm run build`, creates serverless functions for Server Actions, and serves the result from its global CDN.

### Supabase Auth redirect URLs

After deploying, add your Vercel deployment URL to the **Redirect URLs** allowlist in your Supabase project under **Authentication → URL Configuration**:

```
https://your-app.vercel.app/**
```

This allows Supabase to redirect back to your app after email confirmation flows.

---

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
