import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/components/event-people.tsx', import.meta.url), 'utf8').split('export function EventPersonLink')[0].replace(/^import .*;\r?\n/gm, '')).replace('export function useEventPeople', 'function useEventPeople');
function harness(query) {
  const slots = [], effects = [], calls = [], photos = [];
  let index = 0, result;
  const useState = initial => { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }]; };
  const useEffect = (fn, deps) => { const slot = index++, old = slots[slot]; if (!old || deps.some((dep, i) => dep !== old.deps[i])) effects.push(() => { old?.cleanup?.(); slots[slot] = { deps, cleanup: fn() }; }); };
  const db = { from: table => ({ select: fields => ({ in: async (key, ids) => { calls.push({ table, fields, key, ids }); return query(ids); } }) }), storage: { from: bucket => ({ createSignedUrl: async (path, expires) => { photos.push({ bucket, path, expires }); return path === 'unavailable' ? { error: {} } : { data: { signedUrl: `signed:${path}` } }; } }) } };
  const hook = new Function('useEffect', 'useState', 'createClient', 'profilePhotoBucket', `${source};return useEventPeople;`)(useEffect, useState, () => db, 'profile-photos');
  function render(host = 'host', attendees = ['guest']) { index = 0; result = hook(host, attendees); while (effects.length) effects.shift()(); return result; }
  async function settle(host, attendees) { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); return render(host, attendees); }
  render();
  return { render, settle, calls, photos, cleanup: () => slots.forEach(slot => slot?.cleanup?.()) };
}

test('loads only requested public profile fields and signs permitted photos', async () => {
  const h = harness(async () => ({ data: [{ id: 'host', display_name: 'Organizer', avatar_path: 'host/photo.jpg' }, { id: 'guest', display_name: 'Guest', avatar_path: 'unavailable' }] }));
  const result = await h.settle();
  assert.equal(result.loading, false);
  assert.deepEqual(h.calls[0], { table: 'profiles', fields: 'id, display_name, avatar_path', key: 'id', ids: ['host', 'guest'] });
  assert.equal(result.people[0].photoUrl, 'signed:host/photo.jpg');
  assert.equal(result.people[1].photoUrl, '');
  assert.equal(h.photos[0].bucket, 'profile-photos');
  assert.equal(h.photos[0].expires, 3600);
  h.cleanup();
});

test('does not fabricate profiles hidden by RLS, and reloads after membership changes', async () => {
  const h = harness(async () => ({ data: [] }));
  assert.deepEqual((await h.settle()).people, []);
  h.render('host', ['guest', 'new-guest', 'guest']);
  await h.settle('host', ['guest', 'new-guest', 'guest']);
  assert.deepEqual(h.calls.at(-1).ids, ['host', 'guest', 'new-guest']);
  h.cleanup();
});

test('profile query errors can be retried without changing attendance', async () => {
  let fail = true;
  const h = harness(async () => fail ? { error: new Error('unavailable') } : { data: [{ id: 'host', display_name: 'Organizer', avatar_path: null }] });
  const result = await h.settle();
  assert.match(result.error, /couldn’t be loaded/);
  fail = false;
  result.retry();
  h.render();
  const retried = await h.settle();
  assert.equal(retried.error, '');
  assert.equal(retried.people.length, 1);
  h.cleanup();
});
