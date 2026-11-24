import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupMyEvents } from '../src/lib/my-events.ts';
const now = Date.parse('2026-11-04T20:00:00Z');
const event = (id, startsAt, role = 'attending') => ({ id, startsAt, isHost: role === 'hosting', isJoined: role === 'attending' });
const ids = events => events.map(event => event.id);

test('zero events and unrelated events produce empty lists', () => {
  assert.deepEqual(groupMyEvents([], now), { upcoming: [], hosting: [], past: [] });
  assert.deepEqual(groupMyEvents([event('other', '2099-01-01', 'other')], now).upcoming, []);
});
test('one hosting event belongs to Upcoming and Hosting, once per tab', () => {
  const host = { ...event('host', '2026-11-05T20:00:00Z', 'hosting'), isJoined: true };
  const result = groupMyEvents([host, host], now);
  assert.deepEqual(ids(result.upcoming), ['host']);
  assert.deepEqual(ids(result.hosting), ['host']);
  assert.equal(result.past.length, 0);
});
test('sorts future plans ascending and past plans descending, retaining host history', () => {
  const rows = [event('future-later', '2026-12-01T20:00:00Z', 'hosting'), event('old', '2026-10-01T20:00:00Z', 'hosting'), event('recent', '2026-11-03T20:00:00Z'), event('future-near', '2026-11-05T20:00:00Z'), event('past-host', '2026-11-02T20:00:00Z', 'hosting')];
  const original = [...rows];
  const result = groupMyEvents(rows, now);
  assert.deepEqual(ids(result.upcoming), ['future-near', 'future-later']);
  assert.deepEqual(ids(result.past), ['recent', 'past-host', 'old']);
  assert.deepEqual(ids(result.hosting), ['future-later', 'past-host', 'old']);
  assert.deepEqual(rows, original);
});
test('start-time boundary and timezone offsets match Browse classification', () => {
  const result = groupMyEvents([event('exact', '2026-11-04T12:00:00-08:00'), event('future', '2026-11-04T12:00:01-08:00'), event('invalid', 'invalid')], now);
  assert.deepEqual(ids(result.past), ['exact']);
  assert.deepEqual(ids(result.upcoming), ['future']);
});
test('membership changes, cancellation, and time changes immediately affect counts', () => {
  const host = event('host', '2026-11-05T20:00:00Z', 'hosting');
  const joined = event('joined', '2026-11-06T20:00:00Z');
  assert.equal(groupMyEvents([host, joined], now).upcoming.length, 2);
  assert.equal(groupMyEvents([host, { ...joined, isJoined: false }], now).upcoming.length, 1);
  assert.equal(groupMyEvents([joined], now).hosting.length, 0);
  const later = groupMyEvents([host, joined], Date.parse('2026-11-07T20:00:00Z'));
  assert.equal(later.upcoming.length, 0);
  assert.equal(later.past.length, 2);
});
