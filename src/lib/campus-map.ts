import { campusBuildingDirectory } from "./campus-building-directory.js";

export const campusLocations = {
  "science-library": {
    label: "Science Library (SLIB)",
    markerId: "83168",
    note: "The pin marks the library building. Meet outside the main entrance.",
  },
  "utc-bridge": {
    label: "Watson Bridge · near UTC",
    markerId: "126143",
    note: "The pin marks Watson Bridge, not a restaurant. Meet at the University Town Center end of the bridge.",
  },
  "aldrich-park": {
    label: "Aldrich Park",
    markerId: "126146",
    note: "The pin marks the park as a whole. Meet at the entrance near Langson Library.",
  },
} as const;

export type CampusLocationId = keyof typeof campusLocations;

export type CampusMapPlace = { label: string; markerId: string };

// A small, verified demo catalog, not a copy of the live UCI search index.
// Live searches stay inside the official map; its result API requires access.
export const campusSearchPlaces = [
  { label: "Science Library (SLIB)", markerId: "83168", aliases: ["science library", "slib"] },
  { label: "Langson Library (LLIB)", markerId: "83170", aliases: ["langson", "llib"] },
  { label: "Anteater Recreation Center (ARC)", markerId: "1117541", aliases: ["arc", "recreation center"] },
  { label: "Student Center", markerId: "1117786", aliases: ["student center", "sc"] },
  { label: "Aldrich Park", markerId: "126146", aliases: ["aldrich", "park"] },
  { label: "Watson Bridge · near UTC", markerId: "126143", aliases: ["watson", "bridge", "utc", "university town center"] },
] as const;

const officialMapUrl = "https://map.uci.edu/?id=463";
const markerPattern = /^[1-9]\d{0,9}$/;

// A location the host picked. `place` is present when it is pinned on the
// official UCI map; without it the event shows the name and a map search link.
export type CampusChoice = { label: string; place?: CampusMapPlace };

export const maxLocationLabel = 120;
export const isValidMarkerId = (value: string) => markerPattern.test(value);
export const normalizeLocationLabel = (value: string) => value.replace(/\s+/g, " ").trim();

const ignoredWords = new Set(["the", "at", "of", "near", "in", "by", "uci"]);
const plain = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const searchTokens = (value: string) => plain(value).split(" ").filter((word) => word && !ignoredWords.has(word));

// Every typed word has to match something, so "sci lib" finds the Science
// Library and "rec center" finds the ARC. Better matches come first.
function scorePlace(place: { label: string; aliases: readonly string[] }, tokens: string[]) {
  const phrases = [plain(place.label), ...place.aliases.map(plain)];
  const words = phrases.flatMap((phrase) => phrase.split(" "));
  const whole = tokens.join(" ");
  let score = phrases.includes(whole) ? 200 : phrases.some((phrase) => phrase.startsWith(whole)) ? 80 : 0;
  for (const token of tokens) {
    if (words.includes(token)) score += 40;
    else if (words.some((word) => word.startsWith(token))) score += 25;
    else if (phrases.some((phrase) => phrase.includes(token))) score += 8;
    else return 0;
  }
  return score;
}

export function searchDemoPlaces(query: string): CampusMapPlace[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return campusSearchPlaces.map(({ label, markerId }) => ({ label, markerId }));
  return campusSearchPlaces
    .map((place, order) => ({ place, order, score: scorePlace(place, tokens) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ place }) => ({ label: place.label, markerId: place.markerId }));
}

export const campusLocationSuggestions = [...campusSearchPlaces, ...campusBuildingDirectory];

export function searchCampusLocations(query: string) {
  const tokens = searchTokens(query);
  if (!tokens.length) return campusLocationSuggestions;
  return campusLocationSuggestions
    .map((place, order) => ({ place, order, score: scorePlace(place, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ place }) => place);
}

export function resolveCampusLocation(label: string) {
  const normalized = plain(label);
  return normalized ? campusLocationSuggestions.find((place) =>
    [place.label, ...place.aliases].some((name) => plain(name) === normalized)
  ) : undefined;
}

// Splits text into pieces so the parts that match the search can be bold.
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = searchTokens(query);
  const lower = text.toLowerCase();
  if (!tokens.length || lower.length !== text.length) return [{ text, hit: false }];
  const hits = new Array<boolean>(text.length).fill(false);
  for (const token of tokens) {
    for (let at = lower.indexOf(token); at !== -1; at = lower.indexOf(token, at + token.length)) hits.fill(true, at, at + token.length);
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === hits[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: hits[i] });
  }
  return parts;
}

export function getCampusSearchUrl(query: string) {
  const term = query.trim();
  return term ? `${officialMapUrl}#!s/${encodeURIComponent(term)}` : officialMapUrl;
}

// Validate only the share-link format. The person must review the actual marker
// in the official map; a well-formed ID does not prove a place exists.
export function parseCampusShareLink(value: string): { markerId: string; url: string } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "map.uci.edu" || url.port || url.username || url.password || url.pathname !== "/") return null;
    if (url.searchParams.getAll("id").length !== 1 || url.searchParams.get("id") !== "463") return null;
    const markers = url.hash.split(/[?!&]/).filter((part) => part.startsWith("m/"));
    if (markers.length !== 1) return null;
    const markerId = markers[0].slice(2);
    if (!markerPattern.test(markerId)) return null;
    return { markerId, url: `${officialMapUrl}#!m/${markerId}` };
  } catch { return null; }
}

// Official UCI / Concept3D share links. IDs verified against map.uci.edu.
// Watson Bridge connects the campus and UTC across Campus Drive:
// https://parking.uci.edu/traffic/access-clearance/
export function getCampusMap(locationId?: string, chosenPlace?: CampusMapPlace, locationLabel?: string) {
  // Shared events persist the location name. Resolve exact catalog names/aliases
  // after loading them too; partial matches must never silently choose a pin.
  const normalizedLabel = plain(locationLabel ?? "");
  const namedPlace = normalizedLabel ? campusSearchPlaces.find((place) =>
    [place.label, ...place.aliases].some((name) => plain(name) === normalizedLabel)
  ) : undefined;
  const preset = locationId && Object.hasOwn(campusLocations, locationId)
    ? campusLocations[locationId as CampusLocationId]
    : undefined;
  const validChoice = chosenPlace && markerPattern.test(chosenPlace.markerId) && chosenPlace.label.trim() && chosenPlace.label.trim().length <= 120;
  const location = validChoice ? {
    label: chosenPlace.label.trim(),
    markerId: chosenPlace.markerId,
    note: "",
  } : preset ?? (namedPlace ? {
    label: namedPlace.label,
    markerId: namedPlace.markerId,
    note: "",
  } : undefined);
  return {
    url: location
      ? `${officialMapUrl}#!m/${location.markerId}`
      : getCampusSearchUrl(resolveCampusLocation(locationLabel ?? "")?.label ?? locationLabel ?? ""),
    location,
  };
}
