begin;
set local lock_timeout = '5s';

create schema if not exists private;
revoke all on schema private from public, anon;

create table private.daily_event_posts (
  host_id uuid not null references public.profiles (id) on delete cascade,
  post_date date not null,
  event_count integer not null check (event_count >= 1),
  primary key (host_id, post_date)
);

alter table private.daily_event_posts enable row level security;
revoke all on private.daily_event_posts from public, anon, authenticated;

insert into private.daily_event_posts (host_id, post_date, event_count)
select
  host_id,
  (created_at at time zone 'UTC')::date,
  count(*)::integer
from public.events
where (created_at at time zone 'UTC')::date =
  (pg_catalog.clock_timestamp() at time zone 'UTC')::date
group by host_id, (created_at at time zone 'UTC')::date;

create function private.enforce_daily_event_post_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if new.host_id is distinct from (select auth.uid()) then
    raise exception 'You can only create events for your own account';
  end if;

  if lower(coalesce((select auth.jwt() ->> 'email'), '')) !~ '^[^[:space:]@]+@uci[.]edu$' then
    raise exception 'A UCI student account is required to create events';
  end if;

  insert into private.daily_event_posts as daily_posts (host_id, post_date, event_count)
  values (
    new.host_id,
    (pg_catalog.clock_timestamp() at time zone 'UTC')::date,
    1
  )
  on conflict (host_id, post_date) do update
  set event_count = daily_posts.event_count + 1
  where daily_posts.event_count < 3
  returning event_count into current_count;

  if not found then
    raise exception 'Daily event limit reached (3 events per UTC day)';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_daily_event_post_limit() from public, anon, authenticated;

create trigger events_daily_post_limit
  before insert on public.events
  for each row execute function private.enforce_daily_event_post_limit();

commit;
