import assert from "node:assert/strict";
import { test } from "node:test";
import { campusSearchPlaces, campusLocationSuggestions, getCampusMap, getCampusSearchUrl, parseCampusShareLink, searchDemoPlaces, searchCampusLocations, resolveCampusLocation } from "../src/lib/campus-map.ts";

test("campus-wide suggestions support building names, abbreviations and numbers", () => {
  assert.ok(campusLocationSuggestions.length > 80);
  assert.equal(new Set(campusLocationSuggestions.map((place) => place.label)).size, campusLocationSuggestions.length);
  for (const query of ["DBH", "Bren Hall", "314"]) {
    assert.equal(searchCampusLocations(query)[0]?.label, "Donald Bren Hall (DBH)");
  }
  assert.equal(searchCampusLocations("HIB")[0]?.label, "Humanities Instructional Building (HIB)");
  assert.ok(searchCampusLocations("engineering").length >= 5);
  assert.deepEqual(searchCampusLocations("not a real campus building"), []);
  assert.equal(resolveCampusLocation(" DBH ")?.label, "Donald Bren Hall (DBH)");
});

test("directory buildings use official name searches, never building numbers as marker IDs", () => {
  const result = getCampusMap(undefined, undefined, "DBH");
  assert.equal(result.location, undefined);
  assert.equal(result.url, getCampusSearchUrl("Donald Bren Hall (DBH)"));
  assert.equal(getCampusMap(undefined, undefined, "314").url, result.url);
});

test("saved location suggestions retain their exact pins after a database round trip", () => {
  for (const place of campusSearchPlaces) {
    const saved = JSON.parse(JSON.stringify({ location: place.label }));
    assert.equal(getCampusMap(undefined, undefined, saved.location).url, `https://map.uci.edu/?id=463#!m/${place.markerId}`);
  }
  assert.equal(getCampusMap(undefined, undefined, " ARC ").location?.markerId, "1117541");
  assert.equal(getCampusMap(undefined, undefined, "Science Library").location?.markerId, "83168");
});

test("partial and unknown names search the map without guessing a marker", () => {
  for (const name of ["Library", "Science Library room 123", "Engineering & Computing"]) {
    const result = getCampusMap(undefined, undefined, name);
    assert.equal(result.location, undefined);
    assert.equal(result.url, getCampusSearchUrl(name));
  }
  assert.equal(getCampusMap("aldrich-park", undefined, "ARC").location?.markerId, "126146");
});

test("official share links normalize to a single campus marker", () => {
  assert.deepEqual(parseCampusShareLink("https://map.uci.edu/?id=463#!m/1117786?share"), {
    markerId: "1117786", url: "https://map.uci.edu/?id=463#!m/1117786",
  });
  assert.equal(parseCampusShareLink("https://map.uci.edu/?id=463#!ct/95177?m/83168?s/Science%20Library")?.markerId, "83168");
});

test("foreign, ambiguous, or view-only links cannot become event locations", () => {
  for (const link of [
    "https://example.com/?id=463#!m/83168",
    "https://map.uci.edu.evil.example/?id=463#!m/83168",
    "http://map.uci.edu/?id=463#!m/83168",
    "https://someone@map.uci.edu/?id=463#!m/83168",
    "https://map.uci.edu:444/?id=463#!m/83168",
    "https://map.uci.edu/?id=464#!m/83168",
    "https://map.uci.edu/?id=463&id=464#!m/83168",
    "https://map.uci.edu/?id=463#!s/library",
    "https://map.uci.edu/?id=463#!m/83168?m/126146",
    "https://map.uci.edu/?id=463#!m/83168/not-a-marker",
    "https://map.uci.edu/?id=463#!m/0",
    "javascript:alert(1)",
  ]) assert.equal(parseCampusShareLink(link), null, link);
});

test("choosing a place replaces the old event marker", () => {
  const result = getCampusMap("science-library", { label: "Langson Library (LLIB)", markerId: "83170" });
  assert.equal(result.location?.label, "Langson Library (LLIB)");
  assert.equal(result.url, "https://map.uci.edu/?id=463#!m/83170");
  assert.equal(getCampusMap("science-library", { label: "Broken", markerId: "83170?m/other" }).location?.markerId, "83168");
});

test("quick matches are a small catalog and never claim a live map miss", () => {
  assert.equal(searchDemoPlaces("arc")[0]?.markerId, "1117541");
  assert.equal(searchDemoPlaces("Langson")[0]?.markerId, "83170");
  assert.deepEqual(searchDemoPlaces("Uncatalogued campus room"), []);
  assert.equal(getCampusSearchUrl(" Library & café "), "https://map.uci.edu/?id=463#!s/Library%20%26%20caf%C3%A9");
});
