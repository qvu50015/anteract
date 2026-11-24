import type { SharedEvent } from "./event-provider";

function calendarTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function EventCalendarLink({ event, className }: { event: SharedEvent; className: string }) {
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  if (!Number.isFinite(end.getTime())) return null;

  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${calendarTimestamp(start)}/${calendarTimestamp(end)}`,
    location: event.location,
    details: [
      event.description?.trim(),
      event.meetingPoint?.trim() && `Meeting point: ${event.meetingPoint.trim()}`,
      event.bring?.trim() && `What to bring: ${event.bring.trim()}`,
    ].filter(Boolean).join("\n\n"),
  }).toString();

  return <a className={className} href={url.href} target="_blank" rel="noopener noreferrer">
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18m-9 3v5m-2.5-2.5h5" /></svg>
    Add to Google Calendar
    <span className="sr-only"> for {event.title} (opens in a new tab)</span>
  </a>;
}
