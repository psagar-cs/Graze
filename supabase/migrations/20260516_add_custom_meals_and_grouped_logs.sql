alter table public.food_logs
drop constraint if exists food_logs_log_source_check;

alter table public.food_logs
add constraint food_logs_log_source_check
check (log_source in ('pantry_item', 'custom', 'suggested_grouped', 'custom_meal_grouped'));

create table if not exists public.custom_meals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint custom_meals_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.custom_meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  custom_meal_id uuid not null,
  pantry_item_id uuid not null,
  amount_used numeric(8,2) not null check (amount_used > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint custom_meal_ingredients_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint custom_meal_ingredients_custom_meal_id_fkey
    foreign key (custom_meal_id) references public.custom_meals(id) on delete cascade,
  constraint custom_meal_ingredients_pantry_item_id_fkey
    foreign key (pantry_item_id) references public.pantry_items(id) on delete cascade,
  constraint custom_meal_ingredients_unique_item
    unique (custom_meal_id, pantry_item_id)
);

create table if not exists public.food_log_meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  food_log_id uuid not null,
  pantry_item_id uuid,
  ingredient_name text not null,
  amount_used numeric(8,2) not null check (amount_used > 0),
  calories numeric(8,2) not null check (calories >= 0),
  protein numeric(8,2) not null check (protein >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint food_log_meal_items_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint food_log_meal_items_food_log_id_fkey
    foreign key (food_log_id) references public.food_logs(id) on delete cascade,
  constraint food_log_meal_items_pantry_item_id_fkey
    foreign key (pantry_item_id) references public.pantry_items(id) on delete set null
);

drop trigger if exists custom_meals_set_updated_at on public.custom_meals;
create trigger custom_meals_set_updated_at
before update on public.custom_meals
for each row execute procedure public.set_updated_at();

drop trigger if exists custom_meal_ingredients_set_updated_at on public.custom_meal_ingredients;
create trigger custom_meal_ingredients_set_updated_at
before update on public.custom_meal_ingredients
for each row execute procedure public.set_updated_at();

alter table public.custom_meals enable row level security;
alter table public.custom_meal_ingredients enable row level security;
alter table public.food_log_meal_items enable row level security;

drop policy if exists "custom_meals_all_own" on public.custom_meals;
create policy "custom_meals_all_own"
on public.custom_meals for all
using (auth.jwt() ->> 'sub' = user_id)
with check (auth.jwt() ->> 'sub' = user_id);

drop policy if exists "custom_meal_ingredients_all_own" on public.custom_meal_ingredients;
create policy "custom_meal_ingredients_all_own"
on public.custom_meal_ingredients for all
using (auth.jwt() ->> 'sub' = user_id)
with check (auth.jwt() ->> 'sub' = user_id);

drop policy if exists "food_log_meal_items_all_own" on public.food_log_meal_items;
create policy "food_log_meal_items_all_own"
on public.food_log_meal_items for all
using (auth.jwt() ->> 'sub' = user_id)
with check (auth.jwt() ->> 'sub' = user_id);
