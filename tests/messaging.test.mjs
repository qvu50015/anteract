import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareMessages, mergeMessages, validMessage, sortConversations, messagingError, canSendDirectMessage, unreadTotals, unreadLabel, conversationFolder } from '../src/lib/messaging.ts';
const message=(id,created_at='2026-11-03T00:00:00.123456+00:00')=>({id,created_at,conversation_id:'thread',sender_id:'sender',content:id});
test('REST responses, retries and Realtime events merge into one ordered message per ID',()=>{
  const original=[message('b'),message('a')];
  const merged=mergeMessages(original,[message('b'),message('c','2026-11-03T00:00:00.123457Z')]);
  assert.deepEqual(merged.map(x=>x.id),['a','b','c']);
  assert.equal(original.length,2);
  assert.ok(compareMessages(message('z','2026-11-03T00:00:00.123456Z'),message('a','2026-11-03T00:00:00.123457+00:00'))<0);
  assert.equal(compareMessages(message('a','2026-11-03T00:00:00.123Z'),message('a','2026-11-02T16:00:00.123000-08:00')),0);
});
test('prepending history and reconnecting preserve every unique message',()=>{
  const recent=[message('c'),message('d')];
  assert.deepEqual(mergeMessages(recent,[message('a'),message('b'),message('c')]).map(x=>x.id),['a','b','c','d']);
});
test('message validation rejects blanks and enforces Unicode character length',()=>{
  assert.equal(validMessage(' \n\t '),false);assert.equal(validMessage('x'.repeat(1001)),false);
  assert.equal(validMessage('🙂'.repeat(1000)),true);assert.equal(validMessage('Hello\nthere'),true);
});
test('incoming previews reorder conversations without mutating the source list',()=>{
  const a={id:'a',created_at:'2026-11-01T00:00:00Z',last_created_at:null};
  const b={id:'b',created_at:'2026-11-02T00:00:00Z',last_created_at:'2026-11-03T00:00:00Z'};
  const original=[a,b];assert.deepEqual(sortConversations(original).map(x=>x.id),['b','a']);assert.equal(original[0],a);
});
test('authorization and missing migration errors give actionable messages',()=>{
  assert.match(messagingError({code:'42501'}),/accepted first/);
  assert.match(messagingError({code:'PGRST202'}),/migration/);
  assert.match(messagingError(new Error('Offline')),/Offline/);
});

test('consent gates composing: friends and accepted requests can chat, other senders get one introduction',()=>{
 const base={status:'accepted',initiated_by:'me',messaging_blocked:false};
 assert.equal(canSendDirectMessage(base,'me',3),true);
 assert.equal(canSendDirectMessage({...base,status:'pending'},'me',0),true);
 assert.equal(canSendDirectMessage({...base,status:'pending'},'me',1),false);
 assert.equal(canSendDirectMessage({...base,status:'pending'},'recipient',0),false);
 assert.equal(canSendDirectMessage({...base,status:'declined'},'me',0),false);
 assert.equal(canSendDirectMessage({...base,messaging_blocked:true},'me',0),false);
 assert.equal(canSendDirectMessage(base,'',0),false);
});

test('unread totals exclude sent requests, declined threads and blocked profiles',()=>{
 const base={status:'accepted',initiated_by:'other',messaging_blocked:false,unread_count:3};
 assert.deepEqual(unreadTotals([base,{...base,status:'pending',unread_count:1},{...base,status:'pending',initiated_by:'me',unread_count:7},{...base,status:'declined',unread_count:9},{...base,messaging_blocked:true,unread_count:9}], 'me'),{messages:3,requests:1});
 assert.equal(unreadLabel(100),'99+');assert.equal(unreadLabel(3),'3');
});

test('outgoing requests stay in Messages while only the recipient sees them under Requests',()=>{
 const pending={status:'pending',initiated_by:'sender',messaging_blocked:false,last_content:'Hello'};
 assert.equal(conversationFolder(pending,'sender'),'inbox');
 assert.equal(conversationFolder(pending,'recipient'),'requests');
 assert.equal(conversationFolder({...pending,status:'accepted'},'recipient'),'inbox');
 assert.equal(conversationFolder({...pending,last_content:null},'recipient'),null);
 assert.equal(conversationFolder({...pending,status:'declined'},'sender'),null);
 assert.equal(conversationFolder({...pending,messaging_blocked:true},'sender'),null);
});
