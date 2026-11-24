import { getCampusMap } from "@/lib/campus-map";
import type { Hangout } from "@/lib/hangouts";

export function EventLocation({ event }: { event: Pick<Hangout, "location" | "campusLocationId" | "campusMapPlace"> }) {
  const { url, location } = getCampusMap(event.campusLocationId, event.campusMapPlace, event.location);
  return (
    <a
      className="event-location-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${event.location} — ${location ? `view ${location.label}` : "search"} on the official UCI map (opens in a new tab)`}
    >
      <span aria-hidden="true">⌖</span> {event.location}
      <span className="location-link-arrow" aria-hidden="true">↗</span>
    </a>
  );
}
