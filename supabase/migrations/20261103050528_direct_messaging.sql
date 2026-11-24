-- Stage 2: direct messaging. Requires profiles and friend_requests migrations.
-- Fail on equivalent pre-existing objects rather than replacing application data.
set lock_timeout = '5s';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Check authoritative Auth data, never user-editable user_metadata.
create function private.messaging_student() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and lower(u.email) ~ '^[^[:space:]@]+@uci[.]edu$'
  );
$$;
revoke all on function private.messaging_student() from public, anon;
grant execute on function private.messaging_student() to authenticated;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_ordered_pair check (user_low < user_high),
  constraint conversations_unique_pair unique (user_low, user_high)
);
create index conversations_user_high_idx on public.conversations(user_high);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants(user_id, conversation_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint messages_content_length check (char_length(content) between 1 and 1000 and content ~ '[^[:space:]]'),
  constraint messages_sender_participant foreign key (conversation_id, sender_id)
    references public.conversation_participants(conversation_id, user_id) on delete cascade
);
create index messages_history_idx on public.messages(conversation_id, created_at desc, id desc);
create index messages_sender_idx on public.messages(sender_id);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.conversation_participants, public.messages from anon, authenticated;
grant select on public.conversations, public.conversation_participants, public.messages to authenticated;
grant insert (user_low, user_high) on public.conversations to authenticated;
-- IDs supplied by clients make retries idempotent. Times always come from Postgres.
grant insert (id, conversation_id, sender_id, content) on public.messages to authenticated;

create policy "Participants read direct conversations" on public.conversations for select to authenticated
using ((select private.messaging_student()) and (select auth.uid()) in (user_low, user_high));
create policy "Accepted friends start direct conversations" on public.conversations for insert to authenticated
with check (
  (select private.messaging_student()) and (select auth.uid()) in (user_low, user_high)
  and exists (select 1 from public.friend_requests f where f.status = 'accepted'
    and least(f.sender_id, f.recipient_id) = user_low and greatest(f.sender_id, f.recipient_id) = user_high)
);

-- Only this trigger writes membership; callers cannot add a third member or remove either friend.
create function private.populate_direct_participants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or (select auth.uid()) not in (new.user_low, new.user_high) then
    raise exception 'A participant must create the conversation' using errcode = '42501';
  end if;
  insert into public.conversation_participants(conversation_id, user_id)
    values (new.id, new.user_low), (new.id, new.user_high);
  return new;
end;
$$;
revoke all on function private.populate_direct_participants() from public, anon, authenticated;
create trigger populate_direct_participants after insert on public.conversations
for each row execute function private.populate_direct_participants();

-- The lookup terminates at conversations (whose policy checks the pair directly),
-- avoiding recursive participant policies.
create policy "Participants read conversation membership" on public.conversation_participants for select to authenticated
using ((select private.messaging_student()) and exists (
  select 1 from public.conversations c where c.id = conversation_id
));
create policy "Participants read messages" on public.messages for select to authenticated
using ((select private.messaging_student()) and exists (
  select 1 from public.conversation_participants p
  where p.conversation_id = messages.conversation_id and p.user_id = (select auth.uid())
));
create policy "Friends send as themselves" on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid()) and (select private.messaging_student())
  and exists (select 1 from public.conversations c
    join public.friend_requests f on least(f.sender_id, f.recipient_id) = c.user_low
      and greatest(f.sender_id, f.recipient_id) = c.user_high and f.status = 'accepted'
    where c.id = conversation_id and (select auth.uid()) in (c.user_low, c.user_high))
);

-- SECURITY INVOKER: table grants and RLS apply to every operation in these RPCs.
create function public.start_direct_conversation(recipient uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  result uuid;
begin
  if caller is null or recipient is null or caller = recipient then
    raise exception 'Choose an accepted friend to message' using errcode = '42501';
  end if;
  select id into result from public.conversations
    where user_low = least(caller, recipient) and user_high = greatest(caller, recipient);
  if result is not null then return result; end if;
  insert into public.conversations(user_low, user_high)
    values (least(caller, recipient), greatest(caller, recipient))
    on conflict (user_low, user_high) do nothing;
  select id into result from public.conversations
    where user_low = least(caller, recipient) and user_high = greatest(caller, recipient);
  if result is null then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  return result;
end;
$$;
revoke all on function public.start_direct_conversation(uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

create function public.list_direct_conversations() returns table (
  id uuid, recipient_id uuid, display_name text, avatar_path text,
  last_content text, last_sender_id uuid, last_created_at timestamptz, created_at timestamptz
) language sql stable security invoker set search_path = '' as $$
  select c.id, p.id, p.display_name, p.avatar_path, m.content, m.sender_id, m.created_at, c.created_at
  from public.conversations c
  join public.profiles p on p.id = case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end
  left join lateral (
    select content, sender_id, created_at from public.messages where conversation_id = c.id
    order by created_at desc, id desc limit 1
  ) m on true
  where (select auth.uid()) in (c.user_low, c.user_high);
$$;
revoke all on function public.list_direct_conversations() from public, anon;
grant execute on function public.list_direct_conversations() to authenticated;

-- Keyset history: a (timestamp, UUID) cursor preserves messages with identical times.
create function public.direct_message_history(thread_id uuid, before_time timestamptz default null, before_id uuid default null)
returns setof public.messages language sql stable security invoker set search_path = '' as $$
  select * from public.messages m where m.conversation_id = thread_id
    and (before_time is null or (m.created_at, m.id) < (before_time, before_id))
  order by m.created_at desc, m.id desc limit 50;
$$;
revoke all on function public.direct_message_history(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.direct_message_history(uuid, timestamptz, uuid) to authenticated;

-- Reconnect catch-up is ascending and paginated; no gap is hidden by a 50-row limit.
create function public.direct_messages_since(thread_id uuid, after_time timestamptz, after_id uuid)
returns setof public.messages language sql stable security invoker set search_path = '' as $$
  select * from public.messages m where m.conversation_id = thread_id
    and (m.created_at, m.id) > (after_time, after_id)
  order by m.created_at, m.id limit 50;
$$;
revoke all on function public.direct_messages_since(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.direct_messages_since(uuid, timestamptz, uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
reset lock_timeout;
