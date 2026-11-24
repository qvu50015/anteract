-- Extend existing direct conversations; preserve all existing history and memberships.
set lock_timeout = '5s';
create table public.profile_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index profile_blocks_blocked_idx on public.profile_blocks(blocked_id);
alter table public.profile_blocks enable row level security;
revoke all on public.profile_blocks from anon, authenticated;
grant select, delete on public.profile_blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.profile_blocks to authenticated;
create policy "Read your own blocks" on public.profile_blocks for select to authenticated
using (blocker_id = (select auth.uid()) and (select private.messaging_student()));
create policy "Block as yourself" on public.profile_blocks for insert to authenticated
with check (blocker_id = (select auth.uid()) and (select private.messaging_student()));
create policy "Remove your own blocks" on public.profile_blocks for delete to authenticated
using (blocker_id = (select auth.uid()) and (select private.messaging_student()));

-- Only answers whether the caller's own pair is blocked, without exposing block lists.
create function private.messaging_blocked(other_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not private.messaging_student() or exists (
    select 1 from public.profile_blocks b where
      (b.blocker_id = (select auth.uid()) and b.blocked_id = other_user)
      or (b.blocked_id = (select auth.uid()) and b.blocker_id = other_user)
  );
$$;
revoke all on function private.messaging_blocked(uuid) from public, anon;
grant execute on function private.messaging_blocked(uuid) to authenticated;
create function public.profile_safety_status(target uuid)
returns table(blocked_by_you boolean, messaging_blocked boolean)
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.profile_blocks where blocker_id = (select auth.uid()) and blocked_id = target),
    private.messaging_blocked(target)
  where (select private.messaging_student()) and target <> (select auth.uid());
$$;
revoke all on function public.profile_safety_status(uuid) from public, anon;
grant execute on function public.profile_safety_status(uuid) to authenticated;

create table public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('Harassment or bullying','Hate or discrimination','Threats or violence','Sexual misconduct','Spam or scam','Other')),
  details text not null default '' check (char_length(details) <= 2000),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);
create index profile_reports_reporter_idx on public.profile_reports(reporter_id);
create index profile_reports_reported_idx on public.profile_reports(reported_id, created_at desc);
alter table public.profile_reports enable row level security;
revoke all on public.profile_reports from anon, authenticated;
grant select on public.profile_reports to authenticated;
grant insert (id, reporter_id, reported_id, reason, details) on public.profile_reports to authenticated;
create policy "Submit your own report" on public.profile_reports for insert to authenticated
with check (reporter_id = (select auth.uid()) and (select private.messaging_student()));
create policy "Read your own report receipts" on public.profile_reports for select to authenticated
using (reporter_id = (select auth.uid()) and (select private.messaging_student()));

alter table public.conversations add column initiated_by uuid references public.profiles(id) on delete cascade;
alter table public.conversations add column status text not null default 'accepted'
  check (status in ('pending','accepted','declined'));
update public.conversations set initiated_by = user_low;
alter table public.conversations alter column initiated_by set default auth.uid();
alter table public.conversations alter column initiated_by set not null;
alter table public.conversations alter column status set default 'pending';
alter table public.conversations add constraint conversations_initiator_participant check (initiated_by in (user_low,user_high));
create index conversations_initiated_by_idx on public.conversations(initiated_by);
grant update (status) on public.conversations to authenticated;

drop policy "Accepted friends start direct conversations" on public.conversations;
create policy "Students start direct requests" on public.conversations for insert to authenticated
with check ((select private.messaging_student()) and (select auth.uid()) in (user_low,user_high)
  and initiated_by = (select auth.uid())
  and not private.messaging_blocked(case when user_low = (select auth.uid()) then user_high else user_low end));
create policy "Recipients decide pending requests" on public.conversations for update to authenticated
using ((select private.messaging_student()) and status = 'pending'
  and (select auth.uid()) in (user_low,user_high) and initiated_by <> (select auth.uid()))
with check ((select private.messaging_student()) and status in ('accepted','declined')
  and (select auth.uid()) in (user_low,user_high) and initiated_by <> (select auth.uid())
  and (status = 'declined' or not private.messaging_blocked(initiated_by)));

create function private.prepare_message_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.messaging_student() or (select auth.uid()) not in (new.user_low,new.user_high)
    or private.messaging_blocked(case when new.user_low = (select auth.uid()) then new.user_high else new.user_low end) then
    raise exception 'Messaging is unavailable for this profile' using errcode='42501';
  end if;
  new.initiated_by := (select auth.uid());
  new.status := case when exists (select 1 from public.friend_requests f where f.status='accepted'
    and least(f.sender_id,f.recipient_id)=new.user_low and greatest(f.sender_id,f.recipient_id)=new.user_high)
    then 'accepted' else 'pending' end;
  return new;
end;
$$;
revoke all on function private.prepare_message_request() from public, anon, authenticated;
create trigger prepare_message_request before insert on public.conversations
for each row execute function private.prepare_message_request();

-- A row lock serializes introductory sends so concurrent requests cannot bypass the one-message limit.
create function private.authorize_message_send() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  if new.sender_id is distinct from (select auth.uid()) or not private.messaging_student() then
    raise exception 'Send messages as yourself' using errcode='42501';
  end if;
  select * into c from public.conversations where id=new.conversation_id for update;
  if c.id is null or new.sender_id not in (c.user_low,c.user_high)
    or private.messaging_blocked(case when c.user_low=new.sender_id then c.user_high else c.user_low end) then
    raise exception 'Messaging is unavailable for this profile' using errcode='42501';
  end if;
  if c.status='declined' or (c.status='pending' and (c.initiated_by<>new.sender_id or exists (
    select 1 from public.messages m where m.conversation_id=c.id
      and not (m.id=new.id and m.sender_id=new.sender_id and m.content=new.content)
  ))) then
    raise exception 'Wait for this message request to be accepted' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.authorize_message_send() from public, anon, authenticated;
create trigger authorize_message_send before insert on public.messages
for each row execute function private.authorize_message_send();
drop policy "Friends send as themselves" on public.messages;
create policy "Authorized participants send as themselves" on public.messages for insert to authenticated
with check (sender_id = (select auth.uid()) and (select private.messaging_student())
  and exists (select 1 from public.conversations c where c.id=conversation_id
    and (select auth.uid()) in (c.user_low,c.user_high)
    and (c.status='accepted' or (c.status='pending' and c.initiated_by=(select auth.uid())))
    and not private.messaging_blocked(case when c.user_low=(select auth.uid()) then c.user_high else c.user_low end)));

-- A restrictive policy composes with the existing friendship ownership policies.
create policy "Blocks prevent friend invitations" on public.friend_requests as restrictive for insert to authenticated
with check (not private.messaging_blocked(recipient_id));
create policy "Blocks prevent accepting friendships" on public.friend_requests as restrictive for update to authenticated
using (not private.messaging_blocked(sender_id)) with check (not private.messaging_blocked(sender_id));

create or replace function public.start_direct_conversation(recipient uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare caller uuid := (select auth.uid()); result uuid;
begin
  if caller is null or recipient is null or caller=recipient or private.messaging_blocked(recipient) then
    raise exception 'Messaging is unavailable for this profile' using errcode='42501';
  end if;
  select id into result from public.conversations where user_low=least(caller,recipient) and user_high=greatest(caller,recipient);
  if result is not null then return result; end if;
  insert into public.conversations(user_low,user_high) values(least(caller,recipient),greatest(caller,recipient))
    on conflict(user_low,user_high) do nothing;
  select id into result from public.conversations where user_low=least(caller,recipient) and user_high=greatest(caller,recipient);
  return result;
end;
$$;
-- Return type changes require recreation. Existing messages and conversations are untouched.
drop function public.list_direct_conversations();
create function public.list_direct_conversations() returns table (
  id uuid, recipient_id uuid, display_name text, avatar_path text,
  last_content text, last_sender_id uuid, last_created_at timestamptz, created_at timestamptz,
  status text, initiated_by uuid, messaging_blocked boolean
) language sql stable security invoker set search_path = '' as $$
  select c.id,p.id,p.display_name,p.avatar_path,m.content,m.sender_id,m.created_at,c.created_at,
    c.status,c.initiated_by,private.messaging_blocked(p.id)
  from public.conversations c
  join public.profiles p on p.id=case when c.user_low=(select auth.uid()) then c.user_high else c.user_low end
  left join lateral (select content,sender_id,created_at from public.messages where conversation_id=c.id
    order by created_at desc,id desc limit 1) m on true
  where (select auth.uid()) in (c.user_low,c.user_high);
$$;
revoke all on function public.list_direct_conversations() from public, anon;
grant execute on function public.list_direct_conversations() to authenticated;
notify pgrst, 'reload schema';
reset lock_timeout;
