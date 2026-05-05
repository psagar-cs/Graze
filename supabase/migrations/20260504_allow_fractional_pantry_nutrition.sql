alter table public.pantry_items
alter column calories_per_serving type numeric(6,2) using calories_per_serving::numeric(6,2),
alter column protein_per_serving type numeric(6,2) using protein_per_serving::numeric(6,2);
