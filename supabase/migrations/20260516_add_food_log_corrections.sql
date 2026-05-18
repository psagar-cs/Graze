alter table public.food_logs
add column if not exists log_source text not null default 'custom'
check (log_source in ('pantry_item', 'custom', 'suggested_grouped'));

alter table public.food_logs
add column if not exists pantry_amount_used numeric(8,2);

update public.food_logs
set log_source = case
  when pantry_item_id is not null then 'pantry_item'
  else 'custom'
end;

update public.food_logs as logs
set pantry_amount_used = round((logs.servings * pantry.serving_amount)::numeric, 2)
from public.pantry_items as pantry
where logs.pantry_item_id = pantry.id
  and logs.pantry_amount_used is null;
