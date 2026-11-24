import type { Category } from "./hangouts";

// Kept self-contained (no runtime imports) so the rules can be tested on their own.
// These match the same limits used by the location picker in campus-map.ts.
const maxLocationLabel = 120;
const isValidMarkerId = (value: string) => /^[1-9]\d{0,9}$/.test(value);
const normalizeLocationLabel = (value: string) => value.replace(/\s+/g, " ").trim();

// Shared form rules. Database constraints continue to enforce stored field limits.
export const eventCategoryNames = ["Study", "Food", "Active"] as const satisfies readonly Exclude<Category, "All">[];

export type NewEventInput = {
  title: string;
  category: Exclude<Category, "All">;
  location: string;
  campusMarkerId?: string; // official UCI map pin; absent when only a name was chosen
  startsAt: string; // ISO date and time
  description: string;
  meetingPoint: string;
  bring: string;
  capacity: number; // group size, including the host
  tags?: string[];
};

export type NewEventField = "title" | "category" | "location" | "startsAt" | "description" | "meetingPoint" | "bring" | "capacity";
export type NewEventErrors = Partial<Record<NewEventField, string>>;
export type RawNewEvent = Record<Exclude<NewEventField, "location">, string> & { location: string; campusMarkerId?: string };

export const eventLimits = {
  title: { min: 3, max: 100 }, description: { min: 10, max: 1000 },
  meetingPoint: { max: 300 }, bring: { max: 300 }, capacity: { min: 2, max: 50 },
} as const;

export function validateNewEvent(raw: RawNewEvent, now = Date.now()): { ok: true; value: NewEventInput } | { ok: false; errors: NewEventErrors } {
  const errors: NewEventErrors = {};
  const title = raw.title.trim(), description = raw.description.trim();
  const meetingPoint = raw.meetingPoint.trim(), bring = raw.bring.trim();
  const location = normalizeLocationLabel(raw.location);
  const category = normalizeEventCategory(raw.category);
  const capacity = Number(raw.capacity);
  const startsAt = new Date(raw.startsAt);
  const { title: t, description: d, capacity: c } = eventLimits;

  if (title.length < t.min || title.length > t.max) errors.title = `Give your event a title (${t.min}–${t.max} characters).`;
  if (category.length < 2 || category.length > 40 || /[\u0000-\u001f\u007f]/.test(raw.category) || category.toLowerCase() === "all") errors.category = "Make a category with 2–40 characters.";
  if (location.length < 2 || location.length > maxLocationLabel) errors.location = "Choose where you’re meeting.";
  else if (raw.campusMarkerId && !isValidMarkerId(raw.campusMarkerId)) errors.location = "That map pin isn’t valid. Choose the location again.";
  if (!raw.startsAt || !Number.isFinite(startsAt.getTime())) errors.startsAt = "Pick a date and time.";
  else if (startsAt.getTime() <= now) errors.startsAt = "Choose a date and time in the future.";
  if (description.length < d.min || description.length > d.max) errors.description = `Tell people what you’ll do (${d.min}–${d.max} characters).`;
  if (meetingPoint.length > eventLimits.meetingPoint.max) errors.meetingPoint = `Keep this under ${eventLimits.meetingPoint.max} characters.`;
  if (bring.length > eventLimits.bring.max) errors.bring = `Keep this under ${eventLimits.bring.max} characters.`;
  if (!Number.isInteger(capacity) || capacity < c.min || capacity > c.max) errors.capacity = `Group size is a whole number from ${c.min} to ${c.max}, counting you.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: {
    title, category, location, startsAt: startsAt.toISOString(),
    ...(raw.campusMarkerId ? { campusMarkerId: raw.campusMarkerId } : {}),
    description, meetingPoint, bring, capacity,
  } };
}
// datetime-local semantics: interpret the user's wall-clock time in their browser
// timezone, then let validateNewEvent serialize to UTC. Reject rollover/DST gaps.
export function combineEventDateTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "";
  const local = `${date}T${time}`;
  const parsed = new Date(local);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day || parsed.getHours() !== hour || parsed.getMinutes() !== minute) return "";
  return local;
}

export function normalizeEventCategory(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  return eventCategoryNames.find(category => category.toLowerCase() === name.toLowerCase()) ?? name;
}
