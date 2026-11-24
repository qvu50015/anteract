// Run only against disposable test accounts in a staging Supabase project.
// Uses ordinary authenticated clients; no administrative credentials.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const required=['DM_TEST_URL','DM_TEST_PUBLISHABLE_KEY','DM_TEST_A_EMAIL','DM_TEST_A_PASSWORD','DM_TEST_B_EMAIL','DM_TEST_B_PASSWORD','DM_TEST_C_EMAIL','DM_TEST_C_PASSWORD'];
if(required.some(key=>!process.env[key])) throw new Error(`Set all required staging test variables: ${required.join(', ')}`);
const url=process.env.DM_TEST_URL,key=process.env.DM_TEST_PUBLISHABLE_KEY;
const clients=[];
function client(){const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(db);return db;}
async function signIn(db,letter){const {data,error}=await db.auth.signInWithPassword({email:process.env[`DM_TEST_${letter}_EMAIL`],password:process.env[`DM_TEST_${letter}_PASSWORD`]});assert.ifError(error);assert.ok(data.user?.email_confirmed_at);return data.user.id;}
const a=client(),b=client(),c=client();
try {
  const [aid,bid,cid]=await Promise.all([signIn(a,'A'),signIn(b,'B'),signIn(c,'C')]);
  assert.equal(new Set([aid,bid,cid]).size,3,'Use three different test accounts');
  // A and B must already be accepted friends; C must not be their friend.
  const started=await Promise.all([a.rpc('start_direct_conversation',{recipient:bid}),b.rpc('start_direct_conversation',{recipient:aid})]);
  started.forEach(result=>assert.ifError(result.error));
  const id=started[0].data; assert.equal(id,started[1].data,'Concurrent opens created duplicate conversations');
  const run=crypto.randomUUID();
  let receive;
  const delivered=new Promise(resolve=>{receive=resolve;});
  let subscribedResolve,subscribedReject;
  const subscribed=new Promise((resolve,reject)=>{subscribedResolve=resolve;subscribedReject=reject;});
  const channel=b.channel(`dm-integration:${run}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${id}`},payload=>{if(payload.new.content===run)receive(payload.new);}).subscribe(status=>{
    if(status==='SUBSCRIBED')subscribedResolve();
    if(['CHANNEL_ERROR','TIMED_OUT'].includes(status))subscribedReject(new Error(`Realtime ${status}`));
  });
  async function timeout(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Realtime timed out after 20 seconds')),20000);})]);}finally{clearTimeout(timer);}}
  await timeout(subscribed);
  const messageId=crypto.randomUUID();
  const inserted=await a.from('messages').insert({id:messageId,conversation_id:id,sender_id:aid,content:run}).select().single();assert.ifError(inserted.error);
  assert.equal((await timeout(delivered)).id,messageId,'Realtime delivery failed');
  assert.ok((await a.from('messages').insert({id:messageId,conversation_id:id,sender_id:aid,content:run})).error,'Duplicate message ID accepted');
  const device=client();await signIn(device,'B');
  const persisted=await device.from('messages').select().eq('id',messageId).single();assert.ifError(persisted.error);assert.equal(persisted.data.content,run);
  assert.equal((await c.from('messages').select().eq('conversation_id',id)).data.length,0);
  assert.equal((await c.rpc('direct_message_history',{thread_id:id})).data.length,0);
  assert.ok((await c.from('messages').insert({id:crypto.randomUUID(),conversation_id:id,sender_id:cid,content:'unauthorized test'})).error);
  assert.ok((await a.from('messages').insert({id:crypto.randomUUID(),conversation_id:id,sender_id:bid,content:'forged sender'})).error);
  const request=await a.rpc('start_direct_conversation',{recipient:cid});assert.ifError(request.error);
  assert.ifError((await a.from('messages').insert({id:crypto.randomUUID(),conversation_id:request.data,sender_id:aid,content:`${run} introduction`})).error);
  assert.ok((await a.from('messages').insert({id:crypto.randomUUID(),conversation_id:request.data,sender_id:aid,content:'Followup before consent'})).error);
  assert.ok((await c.from('messages').insert({id:crypto.randomUUID(),conversation_id:request.data,sender_id:cid,content:'Reply before consent'})).error);
  assert.ifError((await c.from('conversations').update({status:'accepted'}).eq('id',request.data)).error);
  assert.ifError((await c.from('messages').insert({id:crypto.randomUUID(),conversation_id:request.data,sender_id:cid,content:`${run} request accepted`})).error);
  assert.ok((await a.from('conversation_participants').insert({conversation_id:id,user_id:cid})).error);
  for(const content of ['   ','x'.repeat(1001)])assert.ok((await a.from('messages').insert({id:crypto.randomUUID(),conversation_id:id,sender_id:aid,content})).error);
  await b.removeChannel(channel);assert.equal(b.getChannels().length,0,'Subscription leaked after cleanup');
  // Insert more than a history page while B is disconnected.
  const batch=Array.from({length:55},(_,i)=>({id:crypto.randomUUID(),conversation_id:id,sender_id:aid,content:`${run} pagination ${i}`}));
  assert.ifError((await a.from('messages').insert(batch)).error);
  let cursor=inserted.data;const caught=[];
  while(true){const result=await device.rpc('direct_messages_since',{thread_id:id,after_time:cursor.created_at,after_id:cursor.id});assert.ifError(result.error);caught.push(...result.data);if(result.data.length<50)break;cursor=result.data.at(-1);}
  assert.ok(batch.every(row=>caught.some(x=>x.id===row.id)),'Reconnect catch-up missed messages');
  const recent=await b.rpc('direct_message_history',{thread_id:id});assert.ifError(recent.error);assert.equal(recent.data.length,50);
  const oldest=recent.data.at(-1);
  const older=await b.rpc('direct_message_history',{thread_id:id,before_time:oldest.created_at,before_id:oldest.id});assert.ifError(older.error);
  const ids=[...recent.data,...older.data].map(row=>row.id);assert.equal(new Set(ids).size,ids.length,'History pages overlap');
  const previews=await b.rpc('list_direct_conversations');assert.ifError(previews.error);assert.ok(previews.data.find(row=>row.id===id).last_content.startsWith(run));
  console.log('PASS: two-account delivery, independent-device persistence, concurrent pair uniqueness, RLS isolation, validation, pagination, catch-up, previews, and subscription cleanup.');
  console.log('Test messages remain in the disposable staging conversation; no existing data was deleted.');
} finally {
  await Promise.all(clients.map(async db=>{await db.removeAllChannels();await db.auth.signOut({scope:'local'});}));
}
