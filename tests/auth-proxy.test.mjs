import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { isUciEmail } from '../src/lib/supabase/access.ts';

const source=stripTypeScriptTypes(readFileSync(new URL('../src/proxy.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function proxy','async function proxy').replace('export const config','const config');
async function visit(user,configured=true){
 const response=(kind,url)=>({kind,url,cookies:{getAll:()=>[],set(){}}});
 const proxy=new Function('createServerClient','NextResponse','isUciEmail','process',`${source};return proxy;`)(
  ()=>({auth:{getUser:async()=>({data:{user}})}}),{next:()=>response('next'),redirect:url=>response('redirect',String(url))},isUciEmail,
  {env:{NEXT_PUBLIC_SUPABASE_URL:configured?'https://example.supabase.co':undefined,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:configured?'public-test-key':undefined,NEXT_PUBLIC_GUEST_MODE:'true'}},
 );
 return proxy({url:'https://anteract.test/friends',nextUrl:new URL('https://anteract.test/friends'),cookies:{getAll:()=>[],set(){}}});
}
test('protected pages require authentication even when a retired preview flag is set',async()=>{
 for(const configured of [true,false]){const response=await visit(null,configured);assert.equal(response.kind,'redirect');assert.match(response.url,/\/login/);}
});
test('unconfirmed and non-UCI accounts cannot access protected pages',async()=>{
 for(const user of [{email:'student@uci.edu',email_confirmed_at:null},{email:'person@example.com',email_confirmed_at:'confirmed'}])assert.equal((await visit(user)).kind,'redirect');
});
test('verified UCI users retain access to authenticated app pages',async()=>{
 assert.equal((await visit({email:'student@uci.edu',email_confirmed_at:'confirmed'})).kind,'next');
});
