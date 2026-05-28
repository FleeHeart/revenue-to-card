create or replace view public.analytics_event_summary as
select
  event_name,
  count(*)::bigint as event_count,
  count(distinct session_id)::bigint as session_count,
  min(created_at) as first_seen_at,
  max(created_at) as last_seen_at
from public.analytics_events
group by event_name
order by event_count desc;

create or replace view public.analytics_daily_summary as
select
  created_at::date as event_date,
  count(*)::bigint as event_count,
  count(distinct session_id)::bigint as session_count,
  count(*) filter (where event_name = 'page_view')::bigint as page_views,
  count(*) filter (where event_name = 'field_drawer_opened')::bigint as field_drawer_opens,
  count(*) filter (where event_name = 'field_search')::bigint as field_searches,
  count(*) filter (where event_name = 'field_view')::bigint as field_views,
  count(*) filter (where event_name = 'platform_selected')::bigint as platform_selections,
  count(*) filter (where event_name = 'calculation_ready')::bigint as calculation_ready_count
from public.analytics_events
group by created_at::date
order by event_date desc;

create or replace view public.analytics_field_view_rank as
select
  payload ->> 'field_id' as field_id,
  payload ->> 'field_name' as field_name,
  payload ->> 'category' as category,
  count(*)::bigint as view_count,
  count(distinct session_id)::bigint as session_count,
  max(created_at) as last_viewed_at
from public.analytics_events
where event_name = 'field_view'
group by
  payload ->> 'field_id',
  payload ->> 'field_name',
  payload ->> 'category'
order by view_count desc, last_viewed_at desc;

create or replace view public.analytics_search_keyword_rank as
select
  nullif(trim(payload ->> 'keyword'), '') as keyword,
  payload ->> 'category' as category,
  count(*)::bigint as search_count,
  count(distinct session_id)::bigint as session_count,
  avg(nullif(payload ->> 'result_count', '')::numeric) as avg_result_count,
  max(created_at) as last_searched_at
from public.analytics_events
where event_name = 'field_search'
  and nullif(trim(payload ->> 'keyword'), '') is not null
group by
  nullif(trim(payload ->> 'keyword'), ''),
  payload ->> 'category'
order by search_count desc, last_searched_at desc;

create or replace view public.analytics_platform_selection_rank as
select
  payload ->> 'platform' as platform,
  count(*)::bigint as selection_count,
  count(*) filter (where coalesce((payload ->> 'selected')::boolean, false))::bigint as selected_count,
  count(*) filter (where not coalesce((payload ->> 'selected')::boolean, false))::bigint as unselected_count,
  count(distinct session_id)::bigint as session_count,
  max(created_at) as last_selected_at
from public.analytics_events
where event_name = 'platform_selected'
group by payload ->> 'platform'
order by selection_count desc, last_selected_at desc;

create or replace view public.analytics_calculation_summary as
select
  count(*)::bigint as calculation_count,
  count(distinct session_id)::bigint as session_count,
  avg(nullif(payload ->> 'platform_count', '')::numeric) as avg_platform_count,
  avg(nullif(payload ->> 'result_count', '')::numeric) as avg_result_count,
  max(created_at) as last_calculated_at
from public.analytics_events
where event_name = 'calculation_ready';

create or replace view public.analytics_session_summary as
select
  session_id,
  min(created_at) as first_seen_at,
  max(created_at) as last_seen_at,
  count(*)::bigint as event_count,
  count(*) filter (where event_name = 'page_view')::bigint as page_views,
  count(*) filter (where event_name = 'field_drawer_opened')::bigint as field_drawer_opens,
  count(*) filter (where event_name = 'field_search')::bigint as field_searches,
  count(*) filter (where event_name = 'field_view')::bigint as field_views,
  count(*) filter (where event_name = 'platform_selected')::bigint as platform_selections,
  count(*) filter (where event_name = 'calculation_ready')::bigint as calculation_ready_count
from public.analytics_events
group by session_id
order by last_seen_at desc;

