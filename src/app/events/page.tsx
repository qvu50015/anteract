"use client";

import { EventBrowser } from "@/components/event-browser";
import { useEvents } from "@/components/event-provider";

export default function BrowseEvents() {
  const { events, loading, error, refresh } = useEvents();
  return <EventBrowser events={events} loading={loading} error={error} onRetry={refresh} />;
}
