import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEventTags } from "../src/lib/event-tags.ts";
import { filterEvents, defaultEventFilters, eventCategoryOptions } from "../src/lib/event-filters.ts";

test("tags normalize consistently without silently dropping invalid or extra tags", () => {
  assert.deepEqual(parseEventTags(" #Coffee, coffee, First Years, , board-games "), { ok: true, tags: ["coffee", "first-years", "board-games"] });
  assert.deepEqual(parseEventTags(""), { ok: true, tags: [] });
  for (const invalid of ["a,b,c,d,e,f", "long".repeat(7), "club!", "a--b", "-coffee", "café", "#"]) {
    assert.equal(parseEventTags(invalid).ok, false, invalid);
  }
  assert.deepEqual(parseEventTags([" Coffee", "coffee", "finals"]), { ok: true, tags: ["coffee", "finals"] });
});

const now = new Date(2026, 10, 1, 12, 0, 0);
const at = (day, hour = 16) => new Date(2026, 10, day, hour, 0, 0).toISOString();
const make = (id, patch = {}) => ({ id, category: "Study", title: "Study company", location: "Science Library", description: "Bring your notes", tags: ["coffee", "finals"], startsAt: at(1), participants: 2, capacity: 5, ...patch });
const events = [
  make("past", { startsAt: at(1, 11) }),
  make("later", { startsAt: at(3) }),
  make("today"),
  make("full", { participants: 5, startsAt: at(2), tags: ["coffee"] }),
  make("untagged", { tags: undefined, startsAt: at(2) }),
  make("food", { category: "Food", startsAt: at(2) }),
  make("after-week", { startsAt: at(8, 0) }),
  make("invalid-date", { startsAt: "not-a-date" }),
];

test("discovery combines category, search, all selected tags, dates and open spots", () => {
  const result = filterEvents(events, { ...defaultEventFilters, category: "Study", query: "#coffee", tags: ["coffee", "finals"], when: "week", spotsOnly: true }, now);
  assert.deepEqual(result.map((event) => event.id), ["today", "later"]);
  assert.deepEqual(filterEvents(events, { ...defaultEventFilters, when: "today" }, now).map((event) => event.id), ["today"]);
});

test("old untagged events stay browseable and empty matches stay empty", () => {
  assert.equal(filterEvents(events, defaultEventFilters, now).some((event) => event.id === "untagged"), true);
  assert.deepEqual(filterEvents(events, { ...defaultEventFilters, tags: ["not-present"] }, now), []);
  assert.equal(filterEvents(events, { ...defaultEventFilters, query: "  SCIENCE  " }, now).length, 6);
});

test("tag searches accept spaces, hyphens, and a leading hash", () => {
  const tagged = [make("games", { tags: ["board-games"] }), make("other")];
  for (const query of ["board games", "board-games", "#Board Games", "  BOARD   GAMES  "]) {
    assert.deepEqual(filterEvents(tagged, { ...defaultEventFilters, query }, now).map((event) => event.id), ["games"]);
  }
  assert.deepEqual(filterEvents(tagged, { ...defaultEventFilters, query: "board games", tags: ["finals"] }, now), []);
});

test("today and seven-day boundaries use local calendar midnights", () => {
  const boundaries = [make("now", { startsAt: now.toISOString() }), make("just-before-midnight", { startsAt: new Date(2026, 10, 1, 23, 59, 59).toISOString() }), make("tomorrow", { startsAt: at(2, 0) }), make("last-day", { startsAt: at(7, 23) }), make("next-week", { startsAt: at(8, 0) })];
  assert.deepEqual(filterEvents(boundaries, { ...defaultEventFilters, when: "today" }, now).map((event) => event.id), ["just-before-midnight"]);
  assert.deepEqual(filterEvents(boundaries, { ...defaultEventFilters, when: "week" }, now).map((event) => event.id), ["just-before-midnight", "tomorrow", "last-day"]);
});

test('custom categories become case-insensitive Browse filters and searchable event metadata',()=>{
 const events=[{id:'a',title:'Evening meetup',category:'Board Games',location:'Campus',description:'Play together',tags:[],startsAt:'2099-11-03T18:00:00Z',participants:1,capacity:5},{id:'b',title:'Another meetup',category:'board games',location:'Campus',description:'Play together',tags:[],startsAt:'2099-11-04T18:00:00Z',participants:1,capacity:5}];
 assert.deepEqual(eventCategoryOptions(events),['All','Study','Food','Active','Board Games']);
 assert.equal(filterEvents(events,{...defaultEventFilters,category:'Board Games'},new Date('2099-11-01')).length,2);
 assert.equal(filterEvents(events,{...defaultEventFilters,query:'board games'},new Date('2099-11-01')).length,2);
 assert.deepEqual(eventCategoryOptions([], 'Arts'),['All','Study','Food','Active','Arts']);
});

test('search matches title, location, and interest tags independently', () => {
  const rows = [make('title', { title: 'Coffee chat', tags: [], location: 'ARC' }), make('location', { title: 'Lunch', location: 'Coffee shop', tags: [] }), make('tag', { title: 'Break', location: 'Park', tags: ['coffee'] })];
  assert.deepEqual(filterEvents(rows, { ...defaultEventFilters, query: 'coffee' }, now).map(row => row.id), ['title', 'location', 'tag']);
  assert.equal(filterEvents(rows, { ...defaultEventFilters, category: 'Food' }, now).length, 0);
  assert.equal(filterEvents(rows, { ...defaultEventFilters, query: 'ARC' }, now).length, 1);
  assert.equal(filterEvents([], defaultEventFilters, now).length, 0);
});

test('sorting uses real creation timestamps and remaining spots after filtering', async () => {
  const { sortEvents } = await import('../src/lib/event-filters.ts');
  const rows = [make('soon', { createdAt: at(1, 8), capacity: 3 }), make('new', { createdAt: at(1, 10), startsAt: at(3), capacity: 8 }), make('space', { createdAt: at(1, 9), startsAt: at(2), capacity: 10 }), make('full', { createdAt: at(1, 11), participants: 5 })];
  const filtered = filterEvents(rows, { ...defaultEventFilters, spotsOnly: true, tags: ['coffee'], when: 'week' }, now);
  assert.deepEqual(sortEvents(filtered, 'soonest').map(row => row.id), ['soon', 'space', 'new']);
  assert.deepEqual(sortEvents(filtered, 'newest').map(row => row.id), ['new', 'space', 'soon']);
  assert.deepEqual(sortEvents(filtered, 'spots').map(row => row.id), ['space', 'new', 'soon']);
  assert.deepEqual(filtered.map(row => row.id), ['soon', 'space', 'new']);
  assert.equal(sortEvents([make('missing'), make('valid', { createdAt: at(1, 9) })], 'newest')[0].id, 'valid');
  assert.deepEqual(sortEvents([], 'newest'), []);
  assert.equal(filterEvents(rows, defaultEventFilters, now).length, 4);
});
