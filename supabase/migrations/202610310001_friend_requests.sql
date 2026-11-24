create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  constraint friend_requests_not_self check (sender_id <> recipient_id)
);

create unique index friend_requests_active_pair_idx
  on public.friend_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status in ('pending', 'accepted');
create index friend_requests_recipient_status_idx
  on public.friend_requests (recipient_id, status);
create index friend_requests_sender_status_idx
  on public.friend_requests (sender_id, status);

alter table public.friend_requests enable row level security;
revoke all on public.friend_requests from anon;
grant select, insert on public.friend_requests to authenticated;
grant update (status) on public.friend_requests to authenticated;

create policy "UCI students can view their friend requests"
  on public.friend_requests for select
  to authenticated
  using (
    (select auth.uid()) in (sender_id, recipient_id)
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "UCI students can send friend requests"
  on public.friend_requests for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and status = 'pending'
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );

create policy "Recipients can respond to friend requests"
  on public.friend_requests for update
  to authenticated
  using (
    recipient_id = (select auth.uid())
    and status = 'pending'
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  )
  with check (
    recipient_id = (select auth.uid())
    and status in ('accepted', 'rejected')
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) ~ '^[^[:space:]@]+@uci[.]edu$'
  );
