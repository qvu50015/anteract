import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upcomingHomeEvents, communityEventTags } from '../src/lib/home-discovery.ts';

test('homepage excludes started and invalid events, orders future plans, and leaves source intact', () => {
  const now = Date.parse('2026-11-02T18:00:00Z');
  const events = [{id:'later',startsAt:'2026-11-04T18:00:00Z'}, {id:'past',startsAt:'2026-11-01T18:00:00Z'}, {id:'next',startsAt:'2026-11-03T18:00:00Z'}, {id:'now',startsAt:'2026-11-02T18:00:00Z'}, {id:'invalid',startsAt:'invalid'}];
  assert.deepEqual(upcomingHomeEvents(events, now).map(event => event.id), ['next', 'later']);
  assert.equal(events[0].id, 'later');
  assert.deepEqual(upcomingHomeEvents([], now), []);
});

test('community tags come only from supplied events and remain unique and bounded', () => {
  assert.deepEqual(communityEventTags([]), []);
  assert.deepEqual(communityEventTags([{tags:['coffee','study']}, {tags:['coffee','music']}, {}]), ['coffee','study','music']);
  assert.equal(communityEventTags([{tags:Array.from({length:12},(_,i)=>`interest-${i}`)}]).length,8);
});
