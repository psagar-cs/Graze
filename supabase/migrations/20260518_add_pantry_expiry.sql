alter table public.pantry_items
add column if not exists expires_on date;
