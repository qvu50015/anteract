type PersonalEvent = { id: string; startsAt: string; isHost: boolean; isJoined: boolean };

export const EVENT_POINTS = 10;

export function eventPointsTier(points: number) {
  if (points >= 350) return { name: "Gold", next: null };
  if (points >= 200) return { name: "Silver", next: 350 };
  if (points >= 100) return { name: "Bronze", next: 200 };
  return { name: "Getting started", next: 100 };
}

/** Events are canceled by deletion. Use the provider's current membership snapshot. */
export function groupMyEvents<T extends PersonalEvent>(events: readonly T[], now: number) {
  const unique = [...new Map(events.filter(event => event.isHost || event.isJoined).map(event => [event.id, event])).values()];
  const dated = unique.filter(event => Number.isFinite(Date.parse(event.startsAt)));
  const ascending = (a: T, b: T) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id);
  const upcoming = dated.filter(event => Date.parse(event.startsAt) > now).sort(ascending);
  const past = dated.filter(event => Date.parse(event.startsAt) <= now).sort((a, b) => ascending(b, a));
  // Active hosting plans first, then the most recent hosting history.
  const hosting = [...upcoming, ...past].filter(event => event.isHost);
  return { upcoming, hosting, past };
}

export function pointsProgress(points: number) {
  const tier = eventPointsTier(points);
  const tierStart = tier.name === "Bronze" ? 100 : tier.name === "Silver" ? 200 : tier.name === "Gold" ? 350 : 0;
  const tierEnd = tier.next ?? 350;
  return {
    points,
    tier: tier.name,
    nextTier: tier.next,
    pointsToNextTier: tier.next === null ? 0 : tier.next - points,
    progress: tier.next === null ? 100 : Math.min(100, ((points - tierStart) / (tierEnd - tierStart)) * 100),
  };
}
