import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
let source=readFileSync(new URL('../src/components/unread-messages-provider.tsx',import.meta.url),'utf8');
source=source.slice(source.indexOf('export function UnreadMessagesProvider'),source.indexOf('export function useUnreadMessages'));
source=source.replace(/return <UnreadContext.Provider[^\n]+/,'return children;').replace('export function UnreadMessagesProvider','function UnreadMessagesProvider');
source=stripTypeScriptTypes(source);
function setup(){
 let state,cleanup,auth;let remote={inbox_count:3,request_count:1},fail=false;const channels=[],removed=[];
 const window=new EventTarget(),document=new EventTarget();document.hidden=false;
 const user={id:'me',email:'student@uci.edu',email_confirmed_at:'yes'};
 const db={auth:{getUser:async()=>({data:{user}}),onAuthStateChange:callback=>{auth=callback;return {data:{subscription:{unsubscribe(){}}}};}},rpc:async()=>({data:[remote],error:fail?{message:'Offline'}:null}),
  channel(){const channel={handlers:[],on(_type,filter,callback){channel.handlers.push({filter,callback});return channel;},subscribe(callback){channel.status=callback;channels.push(channel);return channel;}};return channel;},removeChannel(channel){removed.push(channel);return Promise.resolve();}};
 const provider=new Function('useState','useEffect','createClient','isUciEmail','window','document',`${source};return UnreadMessagesProvider;`)(initial=>{state=initial;return[state,value=>{state=typeof value==='function'?value(state):value;}];},fn=>{cleanup=fn();},()=>db,()=>true,window,document);
 provider({children:null});
 return {get state(){return state;},channels,removed,window,setRemote(value){remote=value;},setFail(value){fail=value;},auth:(event,session)=>auth(event,session),cleanup:()=>cleanup(),async settle(){for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));}};
}
test('navigation counts load privately and subscribe to the current user read positions',async()=>{
 const h=setup();try{await h.settle();assert.deepEqual(h.state,{messages:3,requests:1});assert.equal(h.channels.length,1);assert.ok(h.channels[0].handlers.some(x=>x.filter.table==='conversation_reads'&&x.filter.filter==='user_id=eq.me'));}finally{h.cleanup();}assert.equal(h.removed.length,1);
});
test('same-user read events update navigation counts and transient errors preserve the last result',async()=>{
 const h=setup();try{await h.settle();h.setRemote({inbox_count:0,request_count:0});h.channels[0].status('SUBSCRIBED');await h.settle();assert.deepEqual(h.state,{messages:0,requests:0});h.setFail(true);h.setRemote({inbox_count:9,request_count:9});h.channels[0].status('SUBSCRIBED');await h.settle();assert.deepEqual(h.state,{messages:0,requests:0});}finally{h.cleanup();}
});
test('signout clears counts and removes the authenticated subscription',async()=>{
 const h=setup();try{await h.settle();h.auth('SIGNED_OUT',null);await h.settle();assert.deepEqual(h.state,{messages:0,requests:0});assert.equal(h.removed.length,1);}finally{h.cleanup();}
});
