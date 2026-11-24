import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

// An optional isolated Postgres runtime; never connects to the configured project.
const modulePath = process.env.DM_PGLITE_MODULE;
test('direct messaging migration enforces database authorization and history', { skip: !modulePath }, async t => {
  const { PGlite } = await import(modulePath);
  const db = new PGlite({ parsers: { 1184: value => value } });
  const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002', c='00000000-0000-4000-8000-000000000003', outsider='00000000-0000-4000-8000-000000000004', unverified='00000000-0000-4000-8000-000000000005';
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
    grant usage on schema auth, public to authenticated, anon;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
  `);
  for (const file of ['202610240001_profiles.sql','202610310001_friend_requests.sql','20261103050528_direct_messaging.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  for (const [id,email,confirmed] of [[a,'a@uci.edu',true],[b,'b@uci.edu',true],[c,'c@uci.edu',true],[outsider,'outsider@example.com',true],[unverified,'unverified@uci.edu',false]]) {
    await db.query('insert into auth.users values ($1,$2,$3)',[id,email,confirmed?'2026-01-01':null]);
    await db.query('insert into public.profiles(id,display_name) values ($1,$2)',[id,email]);
  }
  await db.query("insert into public.friend_requests(sender_id,recipient_id,status) values ($1,$2,'accepted'),($2,$3,'accepted'),($1,$3,'pending'),($1,$4,'pending'),($2,$5,'accepted')",[a,b,c,outsider,unverified]);
  async function as(id,email=`${id===a?'a':id===b?'b':'c'}@uci.edu`) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[id,email]);
    await db.exec('set role authenticated');
  }
  async function reject(sql,args=[]) { await assert.rejects(db.query(sql,args)); }
  let conversation;
  await t.test('accepted friends create exactly two immutable participants and reuse one pair', async () => {
    await as(a);
    conversation=(await db.query('select public.start_direct_conversation($1) as id',[b])).rows[0].id;
    await as(b);
    assert.equal((await db.query('select public.start_direct_conversation($1) as id',[a])).rows[0].id,conversation);
    assert.equal((await db.query('select * from public.conversation_participants')).rows.length,2);
    await reject('insert into public.conversation_participants values ($1,$2)',[conversation,c]);
    await reject('delete from public.conversation_participants where conversation_id=$1',[conversation]);
    await reject('update public.conversations set user_high=$1 where id=$2',[c,conversation]);
    await reject('select public.start_direct_conversation($1)',[b]);
  });
  await t.test('nonfriends, self, unconfirmed, non-UCI and anonymous users are rejected', async () => {
    await as(a); await reject('select public.start_direct_conversation($1)',[c]);
    await reject('select public.start_direct_conversation($1)',[a]);
    await as(unverified,'unverified@uci.edu'); await reject('select public.start_direct_conversation($1)',[b]);
    await as(outsider,'outsider@example.com'); assert.equal((await db.query('select * from public.conversations')).rows.length,0);
    await reject('select public.start_direct_conversation($1)',[a]);
    await db.exec('reset role; set role anon'); await reject('select * from public.messages');
  });
  await t.test('messages persist for both participants; forged sender and time are rejected', async () => {
    await as(a);
    await db.query('insert into public.messages(id,conversation_id,sender_id,content) values ($1,$2,$3,$4)',['10000000-0000-4000-8000-000000000001',conversation,a,'Hello from A']);
    await reject('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)',[conversation,b,'Impersonated']);
    await reject('insert into public.messages(conversation_id,sender_id,content,created_at) values ($1,$2,$3,now())',[conversation,a,'Backdated']);
    await as(b);
    assert.equal((await db.query('select content from public.messages')).rows[0].content,'Hello from A');
    await db.query('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)',[conversation,b,'Reply from B']);
    await as(a); assert.equal((await db.query('select * from public.messages')).rows.length,2);
    await reject('update public.messages set content=$1',['Edited']);
    await reject('delete from public.messages');
  });
  await t.test('outsiders cannot read, append to or discover unrelated threads through RPCs', async () => {
    await as(c);
    assert.equal((await db.query('select * from public.messages where conversation_id=$1',[conversation])).rows.length,0);
    assert.equal((await db.query('select * from public.conversation_participants where conversation_id=$1',[conversation])).rows.length,0);
    assert.equal((await db.query('select * from public.direct_message_history($1)',[conversation])).rows.length,0);
    assert.equal((await db.query('select * from public.list_direct_conversations()')).rows.length,0);
    await reject('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)',[conversation,c,'Unauthorized']);
  });
  await t.test('whitespace and oversized messages fail; accepted friendship required for new sends', async () => {
    await as(a);
    for (const content of ['', ' \n\t ', 'x'.repeat(1001)]) await reject('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)',[conversation,a,content]);
    await db.exec('reset role');
    await db.query("update public.friend_requests set status='rejected' where sender_id=$1 and recipient_id=$2",[a,b]);
    await as(a); await reject('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)',[conversation,a,'No longer friends']);
    assert.equal((await db.query('select * from public.messages')).rows.length,2);
    await db.exec('reset role'); await db.query("update public.friend_requests set status='accepted' where sender_id=$1 and recipient_id=$2",[a,b]);
  });
  await t.test('authoritative email changes revoke access even while an older UCI JWT is present', async () => {
    await db.exec('reset role');
    await db.query("update auth.users set email='changed@example.com' where id=$1",[a]);
    await as(a, 'a@uci.edu');
    assert.equal((await db.query('select * from public.messages')).rows.length,0);
    assert.equal((await db.query('select * from public.conversations')).rows.length,0);
    await reject('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)',[conversation,a,'Old token']);
    await db.exec('reset role');await db.query("update auth.users set email='a@uci.edu' where id=$1",[a]);
  });
  await t.test('timestamp/ID cursors page history and reconnect catch-up without gaps', async () => {
    await as(a);
    for(let i=0;i<105;i++) await db.query('insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)',[conversation,a,`Message ${i}`]);
    // Force identical microsecond timestamps as the owner to test the UUID tiebreak.
    await db.exec('reset role'); await db.query("update public.messages set created_at='2026-01-01T00:00:00.123456Z' where conversation_id=$1",[conversation]);
    await as(b);
    let page=(await db.query('select * from public.direct_message_history($1)',[conversation])).rows;
    const all=[...page];
    while(page.length===50){const oldest=page.at(-1); page=(await db.query('select * from public.direct_message_history($1,$2,$3)',[conversation,oldest.created_at,oldest.id])).rows;all.push(...page);}
    assert.equal(all.length,107);assert.equal(new Set(all.map(x=>x.id)).size,107);
    const first=all.at(-1);
    const newer=(await db.query('select * from public.direct_messages_since($1,$2,$3)',[conversation,first.created_at,first.id])).rows;
    assert.equal(newer.length,50); assert.equal(newer[0].id,all.at(-2).id);
  });
  await db.close();
});
