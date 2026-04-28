-- Run this SQL in your Supabase SQL editor to set up the tasks table.

-- Enums
create type task_priority as enum ('low', 'medium', 'high');
create type task_status   as enum ('pending', 'completed');

-- Table
create table tasks (
  id         uuid         primary key default gen_random_uuid(),
  title      text         not null,
  due_date   timestamptz,
  priority   task_priority not null default 'low',
  status     task_status   not null default 'pending',
  created_at timestamptz  not null default now()
);

-- Index for the chronological feed query
create index tasks_due_date_idx on tasks (due_date asc nulls last, created_at asc);

-- -----------------------------------------------------------------------------
-- Required if you query with anon/publishable keys (recommended: use SUPABASE_SERVICE_ROLE_KEY
-- server-side only and omit this broad policy in production.)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table tasks to anon, authenticated;

alter table tasks enable row level security;

create policy "tasks_allow_mvp_clients"
  on tasks
  for all
  to anon, authenticated
  using (true)
  with check (true);

