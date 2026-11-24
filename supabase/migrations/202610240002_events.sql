create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  category text not null check (category in ('Study', 'Food', 'Active')),
  location text not null check (char_length(location) between 2 and 120),
  starts_at timestamptz not null,
  description text not null check (char_length(description) between 10 and 1000),
  meeting_point text not null default '' check (char_length(meeting_point) <= 300),
  bring text not null default '' check (char_length(bring) <= 300),
  capacity integer not null check (capacity between 2 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at);
create index events_host_id_idx on public.events (host_id);

create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_members_user_id_idx on public.event_members (user_id, event_id);

alter table public.events enable row level security;
alter table public.event_members enable row level security;
revoke all on public.events, public.event_members from anon;
grant select, insert, delete on public.events to authenticated;
grant select, insert, delete on public.event_members to authenticated;

create policy "UCI students can view events"
  on public.events for select
  to authenticated
  using (
    lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Students can create their own events"
  on public.events for insert
  to authenticated
  with check (
    host_id = (select auth.uid())
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Hosts can delete their own events"
  on public.events for delete
  to authenticated
  using (
    host_id = (select auth.uid())
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "UCI students can view event memberships"
  on public.event_members for select
  to authenticated
  using (
    lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Students can join events as themselves"
  on public.event_members for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Students can leave events"
  on public.event_members for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_count integer;
  event_capacity integer;
  event_host uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.event_id::text, 0)
  );

  select capacity, host_id into event_capacity, event_host
  from public.events
  where id = new.event_id;

  if not found then
    raise exception 'Event does not exist';
  end if;
  if new.user_id = event_host then
    raise exception 'Event hosts are already included';
  end if;

  select count(*) into current_count
  from public.event_members
  where event_id = new.event_id;

  if current_count >= event_capacity - 1 then
    raise exception 'This event is full';
  end if;

  return new;
end;
$$;

create trigger event_members_capacity
  before insert on public.event_members
  for each row execute function public.enforce_event_capacity();
