import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as helpers from '../src/lib/messaging.ts';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/components/use-direct-messages.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function useDirectMessages','function useDirectMessages');
const row=(id='message-1')=>({id,conversation_id:'thread-a',sender_id:'me',content:'Hello',created_at:'2026-11-03T00:00:00.123456+00:00'});
function harness({failInsert=false}={}){
  const slots=[],effects=[],channels=[],removed=[],inserts=[],rpcCalls=[];
  let index=0,hook,output,authCallback,sendFails=failInsert,history=[row()],since=[],list=[{id:'thread-a',recipient_id:'friend',display_name:'A Friend',avatar_path:null,created_at:row().created_at,last_created_at:row().created_at,last_content:'Hello',last_sender_id:'me',status:'accepted',initiated_by:'me',messaging_blocked:false,unread_count:0}];
  const window=new EventTarget();
  const db={auth:{getUser:async()=>({data:{user:{id:'me',email:'me@uci.edu',email_confirmed_at:'yes'}}}),onAuthStateChange:fn=>{authCallback=fn;return {data:{subscription:{unsubscribe(){}}}};}},
    rpc(name,args){rpcCalls.push({name,args});const result={data:name==='start_direct_conversation'?'thread-a':name==='list_direct_conversations'?list:name==='direct_message_history'?history:since,error:null};const chain={then(resolve,reject){return Promise.resolve(result).then(resolve,reject);},select(){return chain;},order(){return chain;},range(){return chain;}};return chain;},
    from(table){if(table==='conversations')return {update(value){const chain={eq(){return chain;},select(){return chain;},maybeSingle:async()=>({data:{id:'thread-a'},error:null})};return chain;}};return {insert(value){inserts.push(value);return {select(){return {single:async()=>sendFails?{error:new Error('Network failure')}:{data:{...row(value.id),content:value.content}}};}};}};},
    channel(name){const channel={name,handlers:[],on(_kind,filter,callback){channel.handlers.push({filter,callback});return channel;},subscribe(callback){channel.status=callback;channels.push(channel);return channel;}};return channel;},
    removeChannel(channel){removed.push(channel);return Promise.resolve();},storage:{from(){return {createSignedUrl:async()=>({data:null})};}}};
  const react={useState(initial){const slot=index++;if(!(slot in slots))slots[slot]=initial;return [slots[slot],value=>{slots[slot]=typeof value==='function'?value(slots[slot]):value;}];},useRef(initial){const slot=index++;if(!(slot in slots))slots[slot]={current:initial};return slots[slot];},useEffect(fn,deps){const slot=index++;const old=slots[slot];if(!old||deps.some((value,i)=>value!==old.deps[i])){old?.cleanup?.();slots[slot]={deps};effects.push(()=>{slots[slot].cleanup=fn();});}}};
  hook=new Function('useEffect','useRef','useState','createClient','isUciEmail','profilePhotoBucket',...Object.keys(helpers),'window','document',`${source};return useDirectMessages;`)(react.useEffect,react.useRef,react.useState,()=>db,()=>true,'photos',...Object.values(helpers),window,{hidden:false});
  function render(recipient='friend'){index=0;output=hook(recipient);while(effects.length)effects.shift()();return output;}
  async function settle(){for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));return render();}
  render();
  return {render,settle,channels,removed,inserts,rpcCalls,window,get output(){return output;},setFail(value){sendFails=value;},setList(value){list=value;},setConsent(status){list=list.map(item=>({...item,status,initiated_by:'friend'}));},setHistory(value){history=value;},setSince(value){since=value;},auth:()=>authCallback('SIGNED_OUT',null),cleanup(){for(const slot of slots)slot?.cleanup?.();}};
}
test('active subscription merges Realtime and confirmed sends by ID and cleans up on unmount',async()=>{
  const h=harness();try{let state=await h.settle();assert.equal(state.active.id,'thread-a');assert.equal(h.channels.length,2);
    const active=h.channels.find(x=>x.name.startsWith('dm-thread'));assert.equal(active.handlers[0].filter.filter,'conversation_id=eq.thread-a');
    assert.equal(await state.send('Hello again'),true);state=h.render();const saved=h.inserts[0];active.handlers[0].callback({new:{...row(saved.id),content:saved.content}});state=h.render();assert.equal(state.messages.filter(x=>x.id===saved.id).length,1);
  }finally{h.cleanup();}assert.equal(h.removed.length,2);
});
test('failed sends retain the same message ID for safe retries',async()=>{
  const h=harness({failInsert:true});try{let state=await h.settle();assert.equal(await state.send('Retry me'),false);state=h.render();assert.match(state.sendError,/Network failure/);h.setFail(false);assert.equal(await state.send('Retry me'),true);assert.equal(h.inserts[0].id,h.inserts[1].id);}finally{h.cleanup();}
});
test('signout immediately clears private messages and removes both subscriptions',async()=>{
  const h=harness();try{await h.settle();h.auth();const state=h.render();assert.equal(state.messages.length,0);assert.equal(state.conversations.length,0);assert.equal(state.userId,'');assert.equal(h.removed.length,2);}finally{h.cleanup();}
});
test('reconnection catches up missed messages and reports channel errors',async()=>{
  const h=harness();try{await h.settle();const active=h.channels.find(x=>x.name.startsWith('dm-thread'));active.status('CHANNEL_ERROR');assert.match(h.render().connection,/Reconnecting/);h.setSince([row('missed-message')]);active.status('SUBSCRIBED');const state=await h.settle();assert.ok(state.messages.some(x=>x.id==='missed-message'));}finally{h.cleanup();}
});

test('switching recipients removes old channels before creating new subscriptions',async()=>{
  const h=harness();try{await h.settle();h.render('another-friend');assert.equal(h.removed.length,2);}finally{h.cleanup();}
});

test('accepting a message request updates its local inbox state immediately',async()=>{
 const h=harness();try{h.setConsent('pending');await h.settle();assert.equal(h.output.active.status,'pending');await h.output.respond(true);assert.equal(h.render().active.status,'accepted');assert.equal(h.render().conversations[0].status,'accepted');}finally{h.cleanup();}
});
test('declining a request removes it from pending without accepting it',async()=>{
 const h=harness();try{h.setConsent('pending');await h.settle();assert.equal(h.output.active.status,'pending');await h.output.respond(false);assert.equal(h.render().active.status,'declined');assert.equal(h.render().conversations[0].status,'declined');}finally{h.cleanup();}
});

test('read marking only acknowledges loaded messages, avoids duplicate writes, and synchronizes badges',async()=>{
 const h=harness();try{await h.settle();await h.output.markRead('not-loaded');assert.equal(h.rpcCalls.filter(x=>x.name==='mark_direct_conversation_read').length,0);
 await h.output.markRead('message-1');await h.output.markRead('message-1');assert.equal(h.rpcCalls.filter(x=>x.name==='mark_direct_conversation_read').length,1);
 assert.equal(h.render().active.unread_count,0);
 const overview=h.channels.find(x=>x.name.startsWith('dm-list'));assert.ok(overview.handlers.some(x=>x.filter.table==='conversation_reads'&&x.filter.filter==='user_id=eq.me'));
 }finally{h.cleanup();}
});
