import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeFriendship, splitFriendships, sharedInterests, filterPeople, emptyPeopleFilters } from '../src/lib/friend-discovery.ts';

const request = (id, sender_id, recipient_id, status) => ({id,sender_id,recipient_id,status,created_at:'2026-11-02T00:00:00Z'});
const rows = [request('old','me','a','rejected'), request('new','a','me','pending'), request('sent','me','b','pending'), request('friend','c','me','accepted'), request('unrelated','x','y','accepted')];

test('tabs split only the current student’s active relationships', () => {
  const parts=splitFriendships(rows,'me');
  assert.deepEqual(parts.received.map(x=>x.id),['new']);
  assert.deepEqual(parts.sent.map(x=>x.id),['sent']);
  assert.deepEqual(parts.friends.map(x=>x.id),['friend']);
});
test('old declined requests never hide a new invitation or prevent requesting again', () => {
  assert.equal(activeFriendship(rows,'me','a').id,'new');
  assert.equal(activeFriendship([rows[0]],'me','a'),undefined);
  assert.equal(activeFriendship(rows,'me','x'),undefined);
});
test('confirmed acceptance moves the same relationship from received to friends in all views', () => {
  const accepted=rows.map(row=>row.id==='new'?{...row,status:'accepted'}:row);
  assert.equal(splitFriendships(accepted,'me').received.length,0);
  assert.equal(splitFriendships(accepted,'me').friends.length,2);
  assert.equal(activeFriendship(accepted,'me','a').status,'accepted');
});
test('confirmed decline removes pending status without making a friendship', () => {
  const declined=rows.map(row=>row.id==='new'?{...row,status:'rejected'}:row);
  assert.equal(splitFriendships(declined,'me').received.length,0);
  assert.equal(splitFriendships(declined,'me').friends.length,1);
  assert.equal(activeFriendship(declined,'me','a'),undefined);
});
test('major, year and shared interest filters combine without changing source results', () => {
  const people=[{id:'a',major:'Informatics',class_year:'Third year',interests:['Coffee','Music']},{id:'b',major:'Informatics',class_year:'Second year',interests:['Music']},{id:'c',major:'Biology',class_year:'Third year',interests:[]}];
  assert.equal(filterPeople(people,emptyPeopleFilters,[]).length,3);
  assert.deepEqual(filterPeople(people,{major:'informatics',year:'Third year',sharedOnly:true},[' coffee ']).map(p=>p.id),['a']);
  assert.equal(filterPeople(people,{...emptyPeopleFilters,sharedOnly:true},[]).length,0);
  assert.deepEqual(sharedInterests(['Coffee','Music'],[' coffee ']),['Coffee']);
  assert.equal(people.length,3);
});
