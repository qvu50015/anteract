import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const modulePath=process.env.DM_PGLITE_MODULE;
test('private unread counts and persistent read positions', {skip:!modulePath}, async t=>{
 const {PGlite}=await import(modulePath);const db=new PGlite({parsers:{1184:value=>value}});
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003',d='00000000-0000-4000-8000-000000000004';
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
 grant usage on schema auth,public to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
 for(const file of ['202610240001_profiles.sql','202610310001_friend_requests.sql','20261103050528_direct_messaging.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
 for(const [id,name]of [[a,'a'],[b,'b'],[c,'c'],[d,'d']]){await db.query('insert into auth.users values($1,$2,now())',[id,`${name}@uci.edu`]);await db.query('insert into profiles(id,display_name) values($1,$2)',[id,`${name} Student`]);}
 await db.query("insert into friend_requests(sender_id,recipient_id,status)values($1,$2,'accepted')",[a,b]);
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[id,`${id===a?'a':id===b?'b':id===c?'c':'d'}@uci.edu`]);await db.exec('set role authenticated');}
 const start=async(other)=>(await db.query('select start_direct_conversation($1) id',[other])).rows[0].id;
 const send=(thread,sender,content='Hello',id=crypto.randomUUID())=>db.query('insert into messages(id,conversation_id,sender_id,content)values($1,$2,$3,$4)',[id,thread,sender,content]);
 const reject=async(sql,args=[])=>assert.rejects(db.query(sql,args));
 await as(a);const legacy=await start(b);await send(legacy,a,'Existing history');
 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/20261103054033_message_requests_and_profile_safety.sql',import.meta.url),'utf8'));

 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/20261103060311_direct_message_unread_counts.sql',import.meta.url),'utf8'));
 const counts=async()=>(await db.query('select * from direct_unread_counts()')).rows[0];
 const mark=(thread,id)=>db.query('select mark_direct_conversation_read($1,$2)',[thread,id]);
 let incoming;
 await t.test('only incoming messages count; accepted inbox and pending requests have separate totals',async()=>{
  await as(a);await send(legacy,a,'Second incoming');await send(legacy,a,'Third incoming');assert.equal(Number((await counts()).inbox_count),0);
  await as(b);await send(legacy,b,'Own reply');assert.equal(Number((await counts()).inbox_count),3);
  await as(a);const request=await start(c);await send(request,a,'Request introduction');assert.equal(Number((await counts()).request_count),0);
  await as(c);assert.equal(Number((await counts()).request_count),1);assert.equal(Number((await counts()).inbox_count),0);
 });
 await t.test('read positions use an exact timestamp/ID cursor and cannot move backwards',async()=>{
  await db.exec('reset role');await db.query("update messages set created_at='2026-11-03T00:00:00.123456Z' where conversation_id=$1",[legacy]);
  await as(b);incoming=(await db.query('select * from messages where conversation_id=$1 and sender_id=$2 order by created_at,id',[legacy,a])).rows;
  await mark(legacy,incoming[0].id);assert.equal(Number((await counts()).inbox_count),2);
  await mark(legacy,incoming[2].id);assert.equal(Number((await counts()).inbox_count),0);
  await mark(legacy,incoming[0].id);assert.equal(Number((await counts()).inbox_count),0);
  assert.equal((await db.query('select last_read_message_id from conversation_reads where conversation_id=$1',[legacy])).rows[0].last_read_message_id,incoming[2].id);
 });
 await t.test('new incoming messages after the cursor become unread again; own sends do not',async()=>{
  await as(a);await send(legacy,a,'New since read');await as(b);assert.equal(Number((await counts()).inbox_count),1);await send(legacy,b,'Own new message');assert.equal(Number((await counts()).inbox_count),1);
 });
 await t.test('read markers persist across authenticated sessions and remain private to their owner',async()=>{
  await as(a);assert.equal((await db.query('select * from conversation_reads where conversation_id=$1',[legacy])).rows.length,0);
  await as(b);assert.equal((await db.query('select * from conversation_reads where conversation_id=$1',[legacy])).rows.length,1);
  await reject('insert into conversation_reads(user_id,conversation_id,last_read_message_id) values($1,$2,$3)',[a,legacy,incoming[0].id]);
  await reject("update conversation_reads set last_read_at='2099-01-01'");
  await as(c);await assert.rejects(mark(legacy,incoming[0].id));assert.equal((await db.query('select * from conversation_reads')).rows.length,0);
 });
 await t.test('a message from another thread cannot be used as the read marker',async()=>{
  await as(a);const second=await start(d);const id=crypto.randomUUID();await send(second,a,'Other thread',id);await assert.rejects(mark(legacy,id));
 });
 await t.test('blocked and declined threads are excluded and accepting moves unread requests to the inbox',async()=>{
  await as(c);const request=(await db.query('select * from list_direct_conversations()')).rows.find(x=>x.initiated_by===a);
  await db.query("update conversations set status='accepted' where id=$1",[request.id]);assert.equal(Number((await counts()).request_count),0);assert.equal(Number((await counts()).inbox_count),1);
  await db.query('insert into profile_blocks(blocker_id,blocked_id)values($1,$2)',[c,a]);assert.equal(Number((await counts()).inbox_count),0);
  await as(d);const declined=(await db.query('select * from list_direct_conversations()')).rows[0];await db.query("update conversations set status='declined' where id=$1",[declined.id]);assert.equal(Number((await counts()).request_count),0);
 });
 await db.close();
});
