"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { eventCategoryTone, eventCategorySymbol } from "@/lib/hangouts";
import { getCampusMap } from "@/lib/campus-map";
import { useEvents, type SharedEvent } from "./event-provider";
import { EventTags } from "./event-tags";
import { EventLocation } from "./event-location";
import { EventCalendarLink } from "./event-calendar-link";
import { EventPersonLink, useEventPeople } from "./event-people";

export function EventDetails({ event }: { event: SharedEvent }) {
  const { joinEvent, leaveEvent, cancelEvent, userId } = useEvents();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { people, loading, error: peopleError, retry } = useEventPeople(event.hostId, event.attendeeIds);
  const host = people.find(person => person.id === event.hostId);
  const attendees = people.filter(person => person.id !== event.hostId && event.attendeeIds.includes(person.id));
  const remaining = Math.max(0, event.capacity - event.participants);
  const full = remaining === 0;
  const past = Date.parse(event.startsAt) <= now;
  const { url: mapUrl, location } = getCampusMap(event.campusLocationId, event.campusMapPlace, event.location);
  const date = new Date(event.startsAt);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (actionError) { setError(actionError && typeof actionError === "object" && "message" in actionError && typeof actionError.message === "string" ? actionError.message : "Could not update this event. Please try again."); }
    finally { setBusy(false); }
  }

  async function share() {
    const url = new URL(`/events/${encodeURIComponent(event.id)}`, window.location.origin).href;
    setShareMessage("");
    setShareUrl("");
    try {
      if (navigator.share) { await navigator.share({ title: event.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setShareMessage("Event link copied.");
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      setShareUrl(url);
      setShareMessage("Copy the event link below to share with another UCI student.");
    }
  }

  return <div className="detail-page event-experience">
    <div className="ed-toolbar">
      <Link className="back-link event-back-link" href="/events"><span className="event-back-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 5-7 7 7 7M5 12h14" /></svg></span><span>Browse events</span></Link>
      <button className="ed-share" type="button" onClick={() => void share()}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M5 14v6h14v-6" /></svg>Share event</button>
    </div>
    <div className="ed-share-feedback" role="status">{shareMessage}</div>
    {shareUrl && <label className="ed-share-fallback">Event link<input readOnly value={shareUrl} onFocus={e => e.target.select()} /></label>}
    <div className="ed-layout">
      <div className="ed-main">
        <header className={`ed-hero ${eventCategoryTone(event.category)}`}>
          <div className="ed-hero-art" aria-hidden="true"><span>{eventCategorySymbol(event.category)}</span></div>
          <div className="ed-hero-content"><div className="ed-badges"><span className="ed-category">{event.category}</span><span className="ed-status">{past ? "Past event" : full ? "Full" : "On campus"}</span></div><h1>{event.title}</h1><EventTags tags={event.tags} /></div>
        </header>
        <section className="ed-host" aria-label="Event organizer">
          {host ? <EventPersonLink person={host} organizer you={event.isHost} /> : <div className="ed-host-fallback"><strong>{event.hostName}</strong><span>Organizer{loading ? " · Loading profile…" : " · Profile unavailable"}</span></div>}
        </section>
        <section className="ed-card" aria-labelledby="ed-about"><h2 id="ed-about">About this event</h2><p className="ed-copy">{event.description || "The organizer hasn’t added a description yet."}</p>{event.bring?.trim() && <div className="ed-bring"><span aria-hidden="true">✦</span><div><h3>What to bring</h3><p className="ed-copy">{event.bring}</p></div></div>}</section>
        <section className="ed-card ed-location" aria-labelledby="ed-location-title">
          <div className="ed-section-heading"><h2 id="ed-location-title">Where we’re meeting</h2><span className="ed-mini-label">UCI campus</span></div>
          <h3>{location?.label ?? event.location}</h3>
          <p className="ed-copy">{event.meetingPoint?.trim() || "The organizer hasn’t added an exact meeting point yet."}</p>
          {!location && <p className="ed-muted">An exact pin isn’t available. Search the location on the official map.</p>}
          <div className="ed-map-actions"><button type="button" className="ed-map-toggle" aria-expanded={mapOpen} aria-controls="ed-map" onClick={() => setMapOpen(open => !open)}>{mapOpen ? "Hide campus map" : "Show campus map"}<span aria-hidden="true">{mapOpen ? "−" : "+"}</span></button><a className="text-link" href={mapUrl} target="_blank" rel="noopener noreferrer">Open UCI map ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
          <div id="ed-map" hidden={!mapOpen}>{mapOpen && <><iframe className="ed-map-frame" src={mapUrl} title={`Official UCI map — ${location?.label ?? event.location}`} loading="lazy" referrerPolicy="no-referrer" allowFullScreen /><p className="ed-muted">Map not loading? Use the official UCI map link above.</p></>}</div>
        </section>
        <section className="ed-card" aria-labelledby="ed-people-title">
          <div className="ed-section-heading"><h2 id="ed-people-title">Who’s going</h2><span className="ed-count">{event.participants} / {event.capacity}</span></div>
          <p className="ed-muted">{past ? "Attendance includes the organizer." : `${remaining} ${remaining === 1 ? "spot" : "spots"} left`}</p>
          {loading ? <p role="status" className="ed-muted">Loading people…</p> : peopleError ? <div role="alert"><p className="ed-muted">{peopleError}</p><button type="button" className="ed-map-toggle" onClick={retry}>Retry profiles</button></div> : <><div className="ed-people">{host && <EventPersonLink person={host} organizer you={event.isHost} />}{attendees.map(person => <EventPersonLink key={person.id} person={person} you={person.id === userId} />)}</div>{attendees.length < event.attendeeIds.length && <p className="ed-muted">Some attendee profiles aren’t available to view.</p>}</>}
          {past && event.attendeeIds.length === 0 && <p className="ed-empty">No additional students joined this event.</p>}
        </section>
      </div>
      <aside className="ed-action-card" aria-label="Event summary and RSVP" aria-busy={busy}>
        <div className="ed-action-heading"><span className="ed-mini-label">YOUR EVENT PLAN</span><span className={`ed-availability ${past || full ? "ed-closed" : ""}`}>{past ? "Past" : full ? "Full" : "Open"}</span></div>
        <dl className="ed-facts"><div><dt>Date</dt><dd><time dateTime={event.startsAt}>{dateLabel}</time></dd></div><div><dt>Time</dt><dd>{timeLabel}</dd></div><div><dt>Location</dt><dd><EventLocation event={event} /></dd></div></dl>
        <div className="ed-capacity"><div><strong>{event.participants} going</strong><span>{remaining} {remaining === 1 ? "spot" : "spots"} left</span></div><progress value={Math.min(event.participants, event.capacity)} max={event.capacity} aria-label={`${event.participants} of ${event.capacity} spots filled`} /></div>
        {past ? <p className="ed-empty">This event has started or passed. Joining is closed.</p> : null}
        {event.isHost ? <><button type="button" className="primary full-width" aria-expanded={managing} aria-controls="ed-management" onClick={() => setManaging(value => !value)}>Manage event <span aria-hidden="true">{managing ? "−" : "+"}</span></button><div id="ed-management" hidden={!managing} className="ed-management"><p className="ed-muted">You’re the organizer. Canceling removes this event for everyone.</p><button type="button" className="ed-cancel" disabled={busy} onClick={() => { if (window.confirm(`Cancel “${event.title}”? This removes the event for everyone and cannot be undone.`)) void run(() => cancelEvent(event.id)); }}>{busy ? "Canceling…" : "Cancel event"}</button></div></> : event.isJoined ? <><p className="ed-joined">✓ You’re on the guest list</p><button type="button" className="secondary full-width" disabled={busy} onClick={() => void run(() => leaveEvent(event.id))}>{busy ? "Leaving…" : "Leave event"}</button></> : <button type="button" className="primary full-width" disabled={busy || full || past || !userId} onClick={() => void run(() => joinEvent(event.id))}>{past ? "Joining closed" : full ? "Event is full" : !userId ? "Sign in to join" : busy ? "Joining…" : "Join event"}</button>}
        {(event.isHost || event.isJoined) && <Link className="ed-agenda-link" href="/my-events"><span>View My Events</span><span className="ed-agenda-arrow" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span></Link>}
        {!past && <EventCalendarLink event={event} className="secondary full-width event-calendar-link" />}
        {!event.isHost && !event.isJoined && !past && !full && <p className="ed-action-note">Joining saves your spot in My Events. You can leave from this page if your plans change.</p>}
        {error && <p className="entry-notice" role="alert">{error}</p>}
      </aside>
    </div>
  </div>;
}
