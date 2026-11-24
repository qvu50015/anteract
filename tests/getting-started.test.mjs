import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { applyGuideActivity, emptyGuideProgress, guideStorageKey, hasProfileBasics, parseGuideProgress, sameGuideProgress } from '../src/lib/getting-started.ts';

test('opening pages never invents a saved profile or event membership', () => {
  const browse = applyGuideActivity(emptyGuideProgress(), '/events', false);
  assert.equal(browse.browse, true);
  assert.equal(browse.profile, false);
  assert.equal(browse.join, false);
  assert.equal(applyGuideActivity(browse, '/my-events', false).plans, false);
  assert.equal(applyGuideActivity(emptyGuideProgress(), '/events/new', false).browse, false);
});

test('a real joined or hosted plan unlocks the agenda milestone and completed actions stay recorded', () => {
  const joined = applyGuideActivity(emptyGuideProgress(), '/events/plan', true);
  assert.equal(joined.join, true);
  assert.equal(joined.plans, false);
  const reviewed = applyGuideActivity(joined, '/my-events', true);
  assert.equal(reviewed.plans, true);
  assert.deepEqual(applyGuideActivity(reviewed, '/', false), reviewed);
});

test('damaged storage and truthy non-boolean values cannot fake completion', () => {
  for (const raw of [null, 'invalid', 'null', '[]', 'false']) assert.deepEqual(parseGuideProgress(raw), emptyGuideProgress());
  assert.deepEqual(parseGuideProgress('{"profile":"true","browse":1,"join":true,"dismissed":true,"extra":true}'), { ...emptyGuideProgress(), join: true, dismissed: true });
  assert.notEqual(guideStorageKey('first'), guideStorageKey('second'));
});

test('profile milestone requires a saved name and at least one usable interest', () => {
  for (const profile of [null, {}, { display_name: 'A', interests: ['Study'] }, { display_name: 'Alex', interests: [] }, { display_name: 'Alex', interests: [' ', 123] }]) assert.equal(hasProfileBasics(profile), false);
  assert.equal(hasProfileBasics({ display_name: 'Alex', interests: ['Study'] }), true);
});

// Exercise the actual provider's effects and public value with isolated hook/storage doubles.
let source = readFileSync(new URL('../src/components/getting-started-provider.tsx', import.meta.url), 'utf8');
source = source.slice(source.indexOf('export function GettingStartedProvider'), source.indexOf('export function useGettingStarted'))
  .replace('export function GettingStartedProvider', 'function GettingStartedProvider')
  .replace('return <GuideContext.Provider value={{', 'return {')
  .replace('}}>{children}</GuideContext.Provider>;', '};');
source = stripTypeScriptTypes(source);

function harness({ brokenStorage = false, deferProfile = false } = {}) {
  const slots = [], effects = [], storage = new Map(), requests = [], window = new EventTarget();
  let index = 0, dirty = false, value, pathname = '/', eventState = { userId: 'first', events: [], loading: false, error: '' };
  const localStorage = {
    getItem(key) { if (brokenStorage) throw new Error('Unavailable'); return storage.get(key) ?? null; },
    setItem(key, raw) { if (brokenStorage) throw new Error('Unavailable'); storage.set(key, raw); },
  };
  const useState = initial => { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }]; };
  const useRef = initial => { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; };
  const changed = (before, deps) => !before || deps.some((dep, i) => !Object.is(dep, before[i]));
  const useCallback = (fn, deps) => { const i = index++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; };
  const useEffect = (fn, deps) => { const i = index++; if (!slots[i] || changed(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); };
  const db = { from: () => ({ select: () => ({ eq: (_key, id) => ({ maybeSingle: () => deferProfile ? new Promise(resolve => requests.push({ id, resolve })) : Promise.resolve({ data: null, error: null }) }) }) }) };
  const provider = new Function('useState', 'useRef', 'useCallback', 'useEffect', 'useEvents', 'usePathname', 'createClient', 'localStorage', 'window', 'emptyGuideProgress', 'guideStorageKey', 'parseGuideProgress', 'hasProfileBasics', 'sameGuideProgress', 'applyGuideActivity', `${source};return GettingStartedProvider;`)(useState, useRef, useCallback, useEffect, () => eventState, () => pathname, () => db, localStorage, window, emptyGuideProgress, guideStorageKey, parseGuideProgress, hasProfileBasics, sameGuideProgress, applyGuideActivity);
  function render() {
    for (let n = 0; n < 15; n++) { index = 0; dirty = false; value = provider({ children: null }); while (effects.length) effects.shift()(); if (!dirty) return value; }
    throw new Error('Provider did not settle');
  }
  render();
  return {
    get value() { return value; }, storage, requests,
    act(fn) { fn(value); return render(); },
    navigate(path, patch = {}) { pathname = path; eventState = { ...eventState, ...patch }; return render(); },
    async settle() { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); return render(); },
    cleanup() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('skip and reopen persist per account without carrying progress into a different account', async () => {
  const h = harness();
  try {
    h.act(guide => guide.setDismissed(true));
    assert.equal(JSON.parse(h.storage.get(guideStorageKey('first'))).dismissed, true);
    assert.equal(h.navigate('/', { userId: 'second' }).progress.dismissed, false);
    assert.equal(h.navigate('/', { userId: 'first' }).progress.dismissed, true);
    h.act(guide => guide.setDismissed(false));
    assert.equal(h.value.progress.dismissed, false);
    assert.equal(h.navigate('/', { userId: '' }).ready, false);
  } finally { h.cleanup(); }
});

test('a stale profile response cannot complete another account and a confirmed profile save updates immediately', async () => {
  const h = harness({ deferProfile: true });
  try {
    h.navigate('/', { userId: 'second' });
    h.requests[0].resolve({ data: { display_name: 'First Student', interests: ['Study'] }, error: null });
    await h.settle();
    assert.equal(h.value.progress.profile, false);
    h.act(guide => guide.completeProfile({ id: 'first', display_name: 'First Student', interests: ['Study'] }));
    assert.equal(h.value.progress.profile, false);
    h.act(guide => guide.completeProfile({ id: 'second', display_name: 'Second Student', interests: ['Study'] }));
    assert.equal(h.value.progress.profile, true);
  } finally { h.cleanup(); }
});

test('storage failures leave guide controls usable and failed event loads do not complete tasks', () => {
  const h = harness({ brokenStorage: true });
  try {
    h.act(guide => guide.setDismissed(true));
    assert.equal(h.value.progress.dismissed, true);
    assert.equal(h.value.persistent, false);
    h.act(guide => guide.setDismissed(false));
    h.navigate('/my-events', { events: [{ isJoined: true }], error: 'Offline' });
    assert.equal(h.value.progress.plans, false);
    h.navigate('/my-events', { error: '' });
    assert.equal(h.value.progress.plans, true);
  } finally { h.cleanup(); }
});
