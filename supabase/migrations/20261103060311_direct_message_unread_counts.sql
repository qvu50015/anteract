-- Private per-user read positions; no read receipts are exposed to other participants.
set lock_timeout = '5s';
create table public.conversation_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_message_id uuid not null references public.messages(id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (user_id, conversation_id)
);
create index conversation_reads_conversation_idx on public.conversation_reads(conversation_id);
create index conversation_reads_message_idx on public.conversation_reads(last_read_message_id);
alter table public.conversation_reads enable row level security;
revoke all on public.conversation_reads from anon, authenticated;
grant select on public.conversation_reads to authenticated;
grant insert (user_id, conversation_id, last_read_message_id) on public.conversation_reads to authenticated;
grant update (last_read_message_id) on public.conversation_reads to authenticated;
create policy "Read only your own message read positions" on public.conversation_reads for select to authenticated
using (user_id = (select auth.uid()) and (select private.messaging_student()));
create policy "Create your own participant read position" on public.conversation_reads for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.messaging_student())
  and exists (select 1 from public.conversation_participants p where p.conversation_id=conversation_reads.conversation_id and p.user_id=(select auth.uid())));
create policy "Advance your own participant read position" on public.conversation_reads for update to authenticated
using (user_id = (select auth.uid()) and (select private.messaging_student()))
with check (user_id = (select auth.uid()) and (select private.messaging_student())
  and exists (select 1 from public.conversation_participants p where p.conversation_id=conversation_reads.conversation_id and p.user_id=(select auth.uid())));

-- Invoker trigger: the referenced message must itself be readable through RLS.
-- Derive the timestamp from that message, never a client-provided wall clock.
create function private.validate_conversation_read() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select m.created_at into new.last_read_at from public.messages m
    where m.id=new.last_read_message_id and m.conversation_id=new.conversation_id;
  if new.last_read_at is null or new.user_id is distinct from (select auth.uid()) then
    raise exception 'Read position must reference your own visible conversation' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (new.last_read_at,new.last_read_message_id) < (old.last_read_at,old.last_read_message_id) then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_conversation_read() from public, anon, authenticated;
create trigger validate_conversation_read before insert or update on public.conversation_reads
for each row execute function private.validate_conversation_read();

create function public.mark_direct_conversation_read(thread_id uuid, message_id uuid) returns void
language sql security invoker set search_path = '' as $$
  insert into public.conversation_reads(user_id,conversation_id,last_read_message_id)
    values((select auth.uid()),thread_id,message_id)
  on conflict(user_id,conversation_id) do update set last_read_message_id=excluded.last_read_message_id;
$$;
revoke all on function public.mark_direct_conversation_read(uuid,uuid) from public, anon;
grant execute on function public.mark_direct_conversation_read(uuid,uuid) to authenticated;

-- The return type gains unread_count, so recreate this invoker function.
drop function public.list_direct_conversations();
create function public.list_direct_conversations() returns table (
  id uuid, recipient_id uuid, display_name text, avatar_path text,
  last_content text, last_sender_id uuid, last_created_at timestamptz, created_at timestamptz,
  status text, initiated_by uuid, messaging_blocked boolean, unread_count bigint
) language sql stable security invoker set search_path = '' as $$
  select c.id,p.id,p.display_name,p.avatar_path,m.content,m.sender_id,m.created_at,c.created_at,
    c.status,c.initiated_by,private.messaging_blocked(p.id),
    case when c.status='declined' or private.messaging_blocked(p.id) then 0 else unread.total end
  from public.conversations c
  join public.profiles p on p.id=case when c.user_low=(select auth.uid()) then c.user_high else c.user_low end
  left join public.conversation_reads r on r.conversation_id=c.id and r.user_id=(select auth.uid())
  left join lateral (select content,sender_id,created_at from public.messages where conversation_id=c.id
    order by created_at desc,id desc limit 1) m on true
  cross join lateral (select count(*) as total from public.messages unseen
    where unseen.conversation_id=c.id and unseen.sender_id<>(select auth.uid())
      and (r.last_read_at is null or (unseen.created_at,unseen.id)>(r.last_read_at,r.last_read_message_id))) unread
  where (select auth.uid()) in (c.user_low,c.user_high);
$$;
revoke all on function public.list_direct_conversations() from public, anon;
grant execute on function public.list_direct_conversations() to authenticated;

create function public.direct_unread_counts() returns table(inbox_count bigint, request_count bigint)
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(unread_count) filter(where status='accepted'),0)::bigint,
    coalesce(sum(unread_count) filter(where status='pending' and initiated_by<>(select auth.uid())),0)::bigint
  from public.list_direct_conversations();
$$;
revoke all on function public.direct_unread_counts() from public, anon;
grant execute on function public.direct_unread_counts() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conversation_reads') then
    alter publication supabase_realtime add table public.conversation_reads;
  end if;
end;
$$;
notify pgrst, 'reload schema';
reset lock_timeout;
