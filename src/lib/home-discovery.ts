/** Keep the homepage preview small, chronological, and limited to future plans. */
export function upcomingHomeEvents<T extends { startsAt: string }>(events: T[], now: number) {
  return events.filter(event => Date.parse(event.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function communityEventTags(events: { tags?: string[] }[]) {
  return [...new Set(events.flatMap(event => event.tags ?? []))].slice(0, 8);
}
