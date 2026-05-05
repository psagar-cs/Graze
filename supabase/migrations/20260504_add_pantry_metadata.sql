alter table public.pantry_items
add column if not exists category text not null default 'other',
add column if not exists effort_level text not null default 'assemble',
add column if not exists meal_role text not null default 'main';
