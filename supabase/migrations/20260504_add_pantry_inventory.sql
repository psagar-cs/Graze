alter table public.pantry_items
add column if not exists serving_amount numeric(8,2) not null default 1 check (serving_amount > 0),
add column if not exists serving_unit text not null default 'serving',
add column if not exists stock_amount numeric(8,2) not null default 0 check (stock_amount >= 0);
