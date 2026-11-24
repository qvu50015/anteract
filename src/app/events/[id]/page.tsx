"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EventDetails } from "@/components/event-details";
import { useEvents } from "@/components/event-provider";

export default function EventPage() {
  const params = useParams<{ id: string }>();
  const { events, loading, error, refresh } = useEvents();
  const event = events.find((item) => item.id === params.id);

  if (loading && !event) return <p className="loading-state" role="status">Loading event…</p>;
  if (error && !event) return <section className="empty-state"><h1>Events aren’t available</h1><p role="alert">{error}</p><Link className="primary" href="/events">Back to events</Link></section>;
  if (!event) return <section className="empty-state"><h1>Event not found</h1><p>It may have been cancelled or removed.</p><Link className="primary" href="/events">Browse events</Link></section>;
  return <>{error && <div className="entry-notice" role="alert">Event updates couldn’t be loaded. {error} <button type="button" className="quiet-button" onClick={() => void refresh()}>Retry</button></div>}<EventDetails key={event.id} event={event} /></>;
}
