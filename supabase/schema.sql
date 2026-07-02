-- enums (idempotent)
do $$ begin
  create type task_priority as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('pending', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attachment_scan_status as enum ('pending', 'clean', 'infected', 'error');
exception when duplicate_object then null; end $$;

create table if not exists tasks (
  id               uuid           primary key default gen_random_uuid(),
  user_id          uuid           not null references auth.users(id) on delete cascade,
  title            text           not null,
  due_date         timestamptz,
  priority         task_priority  not null default 'low',
  status           task_status    not null default 'pending',
  created_at       timestamptz    not null default now(),
  attachment_url   text,
  attachment_s3_key text,
  attachment_name  text,
  attachment_scan_status   attachment_scan_status,
  attachment_scan_verdict_at timestamptz,
  attachment_scan_reason   text
);

-- Migration: add scan columns to an already-existing tasks table (idempotent)
do $$ begin
  alter table tasks add column attachment_scan_status attachment_scan_status;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table tasks add column attachment_scan_verdict_at timestamptz;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table tasks add column attachment_scan_reason text;
exception when duplicate_column then null; end $$;

create index if not exists tasks_user_due_date_idx
  on tasks (user_id, due_date asc nulls last, created_at asc);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table tasks to authenticated;
grant select on table tasks to service_role;

alter table tasks enable row level security;

drop policy if exists "tasks_allow_mvp_clients" on tasks;

create policy "tasks_select_own"
  on tasks for select
  to authenticated
  using (auth.uid() = user_id);

create policy "tasks_insert_own"
  on tasks for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "tasks_update_own"
  on tasks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tasks_delete_own"
  on tasks for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists task_email_reminders (
  id            uuid         primary key default gen_random_uuid(),
  task_id       uuid         not null references tasks(id) on delete cascade,
  reminder_type text         not null,
  sent_at       timestamptz  not null default now(),
  unique (task_id, reminder_type)
);

grant select, insert on table task_email_reminders to service_role;
