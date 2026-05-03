-- ============================================================
-- ScrollMinder — tasks table with per-user row-level security
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- If you ran the MVP schema previously, run the migration block
-- at the bottom instead of the full CREATE TABLE.
-- ============================================================

-- Enums (idempotent guard)
do $$ begin
  create type task_priority as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('pending', 'completed');
exception when duplicate_object then null; end $$;

-- Table
create table if not exists tasks (
  id         uuid           primary key default gen_random_uuid(),
  user_id    uuid           not null references auth.users(id) on delete cascade,
  title      text           not null,
  due_date   timestamptz,
  priority   task_priority  not null default 'low',
  status     task_status    not null default 'pending',
  created_at timestamptz    not null default now()
);

-- Index for the chronological feed query
create index if not exists tasks_user_due_date_idx
  on tasks (user_id, due_date asc nulls last, created_at asc);

-- ============================================================
-- Grants: authenticated role only (no anon access)
-- ============================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on table tasks to authenticated;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table tasks enable row level security;

-- Drop the old open-door MVP policy if it exists
drop policy if exists "tasks_allow_mvp_clients" on tasks;

-- Users can only read their own tasks
create policy "tasks_select_own"
  on tasks for select
  to authenticated
  using (auth.uid() = user_id);

-- Users can only insert rows they own
create policy "tasks_insert_own"
  on tasks for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can only update their own tasks
create policy "tasks_update_own"
  on tasks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can only delete their own tasks
create policy "tasks_delete_own"
  on tasks for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- Email reminder deduplication table
-- Prevents a cron run from sending the same reminder twice for
-- the same task+threshold combination.
-- ============================================================

create table if not exists task_email_reminders (
  id         uuid         primary key default gen_random_uuid(),
  task_id    uuid         not null references tasks(id) on delete cascade,
  -- 'due_3d' for 3-day threshold, 'due_5d' for 5-day threshold
  reminder_type text      not null,
  sent_at    timestamptz  not null default now(),
  unique (task_id, reminder_type)
);

-- No RLS needed: this table is only accessed by the cron via the service role.
-- Grant access to the service role (already superuser; explicit for clarity).
grant select, insert on table task_email_reminders to service_role;

-- ============================================================
-- Migration: if upgrading from the MVP schema (no user_id)
-- Run only the lines below instead of the full file above.
-- ============================================================
-- alter table tasks add column if not exists
--   user_id uuid references auth.users(id) on delete cascade;
-- update tasks set user_id = '<your-user-uuid>' where user_id is null;
-- alter table tasks alter column user_id set not null;
-- drop index if exists tasks_due_date_idx;
-- create index tasks_user_due_date_idx
--   on tasks (user_id, due_date asc nulls last, created_at asc);

-- ============================================================
-- Migration: S3 attachment support (run in Supabase SQL editor)
-- attachment_url was already added separately; run the two below.
-- ============================================================
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachment_s3_key TEXT;
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachment_name TEXT;
