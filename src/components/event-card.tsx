"use client";

import Link from "next/link";
import { useState } from "react";
import { eventCategoryTone, eventCategorySymbol } from "@/lib/hangouts";
import type { SharedEvent } from "./event-provider";
import { useEvents } from "./event-provider";
import { EventTags } from "./event-tags";
import { EventLocation } from "./event-location";
import { EventCalendarLink } from "./event-calendar-link";
import { useEventPeople } from "./event-people";
import { ProfileAvatar } from "./profile-avatar";

export function EventCard({ event, variant = "default", past = false }: { event: SharedEvent; variant?: "default" | "personal" | "discovery"; past?: boolean }) {
  const { joinEvent } = useEvents();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const joined = event.isJoined;
  const full = event.participants >= event.capacity;
  async function join() {
    if (busy || full || event.isHost || joined) return;
    setBusy(true); setError("");
    try { await joinEvent(event.id); }
    catch (joinError) { setError(joinError && typeof joinError === "object" && "message" in joinError ? String(joinError.message) : "Could not join this event."); }
    finally { setBusy(false); }
  }

  if (variant === "discovery") return <DiscoveryEventCard event={event} busy={busy} error={error} onJoin={join} />;
  if (variant === "personal") return <PersonalEventCard event={event} past={past} />;
  return <article className="card">
    <Link className={`card-art ${eventCategoryTone(event.category)}`} href={`/events/${event.id}`} aria-label={`Details for ${event.title}`}><span aria-hidden="true">{eventCategorySymbol(event.category)}</span><span className="category-label">{event.category}</span></Link>
    <div className="card-body">
      <p className="time">{event.time}</p><h3><Link href={`/events/${event.id}`}>{event.title}</Link></h3>
      <p className="location"><EventLocation event={event} /></p><p className="description">{event.description}</p>
      <EventTags tags={event.tags} />
      <Link className="host-line" href={`/profiles/${event.hostId}`}><span className="avatar tiny blue">{event.hostName.slice(0, 1).toUpperCase()}</span><span>Hosted by {event.hostName.split(" ")[0]}</span></Link>
      <div className="card-footer"><span>{event.participants}/{event.capacity} going</span><div className="card-actions"><Link className="details-link" href={`/events/${event.id}`}>Details</Link>{event.isHost ? <Link className="join joined" href={`/events/${event.id}`}>Hosting</Link> : joined ? <Link className="join joined" href="/my-events">In My Events ✓</Link> : <button type="button" className="join" disabled={busy || full} aria-label={`Join ${event.title}`} onClick={join}>{full ? "Full" : busy ? "Joining…" : "Join"}</button>}</div></div>
      {error && <p className="entry-notice" role="alert">{error}</p>}
    </div>
  </article>;
}


function PersonalEventCard({ event, past }: { event: SharedEvent; past: boolean }) {
  const date = new Date(event.startsAt);
  return <article className="personal-event-card">
    <Link className={`personal-event-art ${eventCategoryTone(event.category)}`} href={`/events/${event.id}`} aria-label={`Details for ${event.title}`} tabIndex={-1}>
      <time className="personal-event-date" dateTime={event.startsAt}><span>{date.toLocaleDateString(undefined, { month: "short" })}</span><strong>{date.getDate()}</strong></time>
      <span className="personal-event-category">{event.category}</span><span className="personal-event-symbol" aria-hidden="true">{eventCategorySymbol(event.category)}</span>
    </Link>
    <div className="personal-event-body">
      <div className="personal-event-badges">{(event.isHost || event.isJoined) && <span className={`personal-event-role ${event.isHost ? "hosting" : "attending"}`}>{event.isHost ? "Hosting" : "Attending"}</span>}{past && <span className="personal-event-past">Past event</span>}</div>
      <h3><Link href={`/events/${event.id}`}>{event.title}</Link></h3>
      <time className="personal-event-time" dateTime={event.startsAt}>{event.time}</time>
      <div className="personal-event-location"><EventLocation event={event} /></div>
      {event.description && <p className="personal-event-description">{event.description}</p>}
      <div className="personal-event-footer"><span>{event.participants} / {event.capacity} {past ? "participants" : "going"}</span><Link href={`/events/${event.id}`} aria-label={`View event: ${event.title}`}>View event <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></Link></div>
      {!past && <EventCalendarLink event={event} className="secondary full-width event-calendar-link" />}
    </div>
  </article>;
}


function DiscoveryEventCard({ event, busy, error, onJoin }: { event: SharedEvent; busy: boolean; error: string; onJoin: () => Promise<void> }) {
  const { people } = useEventPeople(event.hostId, []);
  const organizer = people.find(person => person.id === event.hostId);
  const name = organizer?.display_name || event.hostName;
  const spots = Math.max(0, event.capacity - event.participants);

  return (
    <article className="discovery-event-card">
      <div className="discovery-event-main">
        <span className={`discovery-event-symbol ${eventCategoryTone(event.category)}`} aria-hidden="true">{eventCategorySymbol(event.category)}</span>
        <div className="discovery-event-info">
          <p className="discovery-event-meta">
            <time dateTime={event.startsAt}>{event.time}</time>
            <span aria-hidden="true">·</span>
            <span>{event.category}</span>
          </p>
          <h3><Link href={`/events/${event.id}`}>{event.title}</Link></h3>
          <div className="discovery-event-location"><EventLocation event={event} /></div>
          <EventTags tags={event.tags} />
        </div>
      </div>
      <div className="discovery-event-footer">
        <Link className="discovery-host" href={`/profiles/${event.hostId}`} aria-label={`View organizer profile: ${name}`}>
          <ProfileAvatar name={name} photoUrl={organizer?.photoUrl} />
          <span>{name}</span>
        </Link>
        <div className="discovery-event-attendance">
          <span>{spots === 0 ? "Full" : `${spots} ${spots === 1 ? "spot" : "spots"} left`}</span>
          {event.isHost ? <strong>Hosting</strong> : spots > 0 || event.isJoined || busy ? (
            <button type="button" className="primary discovery-join" aria-disabled={busy || event.isJoined || spots === 0} aria-label={event.isJoined ? `Joined ${event.title}` : `Join ${event.title}`} onClick={onJoin}>
              {event.isJoined ? "Joined" : busy ? "Joining…" : spots === 0 ? "Full" : "Join"}
            </button>
          ) : null}
          <span className="sr-only" role="status">{event.isJoined ? `You joined ${event.title}. Find it in My Events.` : ""}</span>
        </div>
      </div>
      {error && <p className="entry-notice" role="alert">{error}</p>}
    </article>
  );
}
