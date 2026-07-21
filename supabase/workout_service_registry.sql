create table if not exists public.workout_service_registry (
  id text primary key,
  service_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.workout_service_registry enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.workout_service_registry to service_role;
