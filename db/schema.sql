-- Livyato database. Run once in the Supabase SQL editor (safe to run again).
create extension if not exists pgcrypto;

do $$ begin create type member_role as enum ('owner','admin','staff','accountant'); exception when duplicate_object then null; end $$;

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vat_registered boolean not null default false,
  vat_number text,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'owner',
  primary key (org_id, user_id)
);

create table if not exists statements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  bank text,
  file_path text,
  transaction_count int not null default 0,
  summary jsonb,
  receipts jsonb not null default '[]',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references statements(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  position int not null,
  txn_date date not null,
  description text not null,
  amount numeric(14,2) not null,
  category text not null,
  data jsonb not null,
  unique (statement_id, position)
);

create table if not exists subscriptions (
  org_id uuid primary key references organisations(id) on delete cascade,
  email text,
  status text not null default 'none',
  current_period_end timestamptz,
  paystack_customer_code text,
  subscription_code text,
  plan_code text,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  org_id uuid not null,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index if not exists statements_org_idx on statements(org_id, created_at desc);
create index if not exists transactions_stmt_idx on transactions(statement_id, position);
create index if not exists transactions_org_idx on transactions(org_id);
create index if not exists subscriptions_email_idx on subscriptions(email);
create index if not exists audit_org_idx on audit_log(org_id, at desc);

-- The audit log can only be added to, never changed or deleted
create or replace function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
drop trigger if exists audit_no_change on audit_log;
create trigger audit_no_change before update or delete on audit_log for each row execute function forbid_change();

-- Row-level security: a signed-in person can only read rows from their own organisation.
-- All writes go through the server (api/*), which uses the service role key.
create or replace function is_member(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid())
$$;

alter table organisations enable row level security;
alter table memberships enable row level security;
alter table statements enable row level security;
alter table transactions enable row level security;
alter table subscriptions enable row level security;
alter table audit_log enable row level security;

drop policy if exists org_read on organisations;
create policy org_read on organisations for select using (is_member(id));
drop policy if exists member_read on memberships;
create policy member_read on memberships for select using (user_id = auth.uid());
drop policy if exists stmt_read on statements;
create policy stmt_read on statements for select using (is_member(org_id));
drop policy if exists txn_read on transactions;
create policy txn_read on transactions for select using (is_member(org_id));
drop policy if exists sub_read on subscriptions;
create policy sub_read on subscriptions for select using (is_member(org_id));
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (is_member(org_id));

-- Private storage for uploaded statements. No public access and no browser policies:
-- uploads use one-time signed links issued by api/upload-url.js.
insert into storage.buckets (id, name, public) values ('statements', 'statements', false) on conflict (id) do nothing;
