create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id text primary key,
  daily_calorie_target integer not null default 3000,
  daily_protein_target integer not null default 180,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  default_serving text not null,
  calories_per_serving integer not null check (calories_per_serving >= 0),
  protein_per_serving integer not null check (protein_per_serving >= 0),
  quantity_label text not null default 'In stock',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pantry_items_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  logged_at timestamptz not null default timezone('utc', now()),
  pantry_item_id uuid,
  custom_name text,
  servings numeric(6,2) not null default 1,
  calories integer not null check (calories >= 0),
  protein integer not null check (protein >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint food_logs_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint food_logs_pantry_item_id_fkey
    foreign key (pantry_item_id) references public.pantry_items(id) on delete set null,
  constraint food_logs_name_check
    check (pantry_item_id is not null or custom_name is not null)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists pantry_items_set_updated_at on public.pantry_items;
create trigger pantry_items_set_updated_at
before update on public.pantry_items
for each row execute procedure public.set_updated_at();

drop trigger if exists food_logs_set_updated_at on public.food_logs;
create trigger food_logs_set_updated_at
before update on public.food_logs
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.pantry_items enable row level security;
alter table public.food_logs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (auth.jwt() ->> 'sub' = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.jwt() ->> 'sub' = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.jwt() ->> 'sub' = id)
with check (auth.jwt() ->> 'sub' = id);

drop policy if exists "pantry_items_all_own" on public.pantry_items;
create policy "pantry_items_all_own"
on public.pantry_items for all
using (auth.jwt() ->> 'sub' = user_id)
with check (auth.jwt() ->> 'sub' = user_id);

drop policy if exists "food_logs_all_own" on public.food_logs;
create policy "food_logs_all_own"
on public.food_logs for all
using (auth.jwt() ->> 'sub' = user_id)
with check (auth.jwt() ->> 'sub' = user_id);
