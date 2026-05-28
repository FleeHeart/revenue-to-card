create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  session_id text not null,
  page_url text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

drop policy if exists "Allow anonymous analytics inserts" on public.analytics_events;

create policy "Allow anonymous analytics inserts"
on public.analytics_events
for insert
to anon
with check (
  event_name in (
    'page_view',
    'field_drawer_opened',
    'field_search',
    'field_view',
    'platform_selected',
    'calculation_ready'
  )
);

