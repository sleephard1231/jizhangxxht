create table if not exists public.transactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  date date not null,
  merchant text not null,
  category text not null,
  account text not null,
  amount numeric not null,
  kind text not null check (kind in ('income', 'expense')),
  source text not null,
  notes text,
  excluded_from_analytics boolean not null default false,
  imported_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.category_rules (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  keywords text not null,
  category text not null,
  kind text check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.import_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  file text not null,
  imported_at date not null,
  rows integer not null default 0,
  added integer not null default 0,
  skipped integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.transactions enable row level security;
alter table public.category_rules enable row level security;
alter table public.import_batches enable row level security;

drop policy if exists "Users can manage own transactions" on public.transactions;
create policy "Users can manage own transactions"
  on public.transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own category rules" on public.category_rules;
create policy "Users can manage own category rules"
  on public.category_rules
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own import batches" on public.import_batches;
create policy "Users can manage own import batches"
  on public.import_batches
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
