"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EventCard } from "./event-card";
import type { SharedEvent } from "./event-provider";
import { defaultEventFilters, filterEvents, eventCategoryOptions, sortEvents, type EventFilters, type EventSort } from "@/lib/event-filters";
import { parseEventTags, tagLimits } from "@/lib/event-tags";

type BrowserProps = { events: SharedEvent[]; loading?: boolean; error?: string; onRetry?: () => Promise<void> };

export function EventBrowser(props: BrowserProps) {
  return <Suspense fallback={<p className="loading-state" role="status">Loading event filters…</p>}><EventBrowserContent {...props} /></Suspense>;
}

function EventBrowserContent({ events, loading = false, error = "", onRetry }: BrowserProps) {
  const [filters, setFilters] = useState<EventFilters>({ ...defaultEventFilters });
  const [sort, setSort] = useState<EventSort>("soonest");
  const [expanded, setExpanded] = useState(false);
  const [clock, setClock] = useState<number | null>(null);
  const tagQuery = useSearchParams().get("tag") ?? "";
  useEffect(() => {
    const parsed = parseEventTags(tagQuery);
    setFilters((current) => ({ ...current, tags: parsed.ok ? parsed.tags : [] }));
  }, [tagQuery]);
  useEffect(() => {
    const update = () => setClock(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);

  function update(patch: Partial<EventFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    if (patch.tags) {
      const url = new URL(window.location.href);
      if (patch.tags.length) url.searchParams.set("tag", patch.tags.join(","));
      else url.searchParams.delete("tag");
      window.history.replaceState(null, "", url);
    }
  }

  const now = new Date(clock ?? 0);
  const upcoming = events.filter((event) => Date.parse(event.startsAt) > now.getTime());
  const availableTags = [...new Set([...upcoming.flatMap((event) => event.tags ?? []), ...filters.tags])].sort();
  const filteredEvents = sortEvents(filterEvents(events, filters, now), sort);
  const categories = eventCategoryOptions(upcoming, filters.category);
  const activeFilters: { label: string; remove: () => void }[] = [
    ...(filters.when !== "upcoming" ? [{ label: filters.when === "today" ? "Today" : "Next 7 days", remove: () => update({ when: "upcoming" }) }] : []),
    ...(filters.spotsOnly ? [{ label: "Has open spots", remove: () => update({ spotsOnly: false }) }] : []),
    ...filters.tags.map(tag => ({ label: `#${tag}`, remove: () => update({ tags: filters.tags.filter(item => item !== tag) }) })),
  ];
  const hasFilters = activeFilters.length > 0 || !!filters.query.trim() || filters.category !== "All";
  const clear = () => { update({ ...defaultEventFilters, tags: [] }); };
  const pending = clock === null || (loading && events.length === 0);

  return <div className="event-discovery">
    <header className="discovery-heading"><h1>Browse events</h1><Link className="primary" href="/events/new"><span aria-hidden="true">+</span> Create an event</Link></header>
    <section className="discovery-controls" aria-label="Search and filter events">
      <div className="discovery-search-row"><label className="discovery-search"><span className="sr-only">Search events, locations or tags</span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" placeholder="Search events, places, or interests" value={filters.query} onChange={event => update({ query: event.target.value })} /></label><button type="button" className="discovery-filter-toggle" aria-expanded={expanded} aria-controls="discovery-advanced" onClick={() => setExpanded(value => !value)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 17h16M9 4v6M15 14v6" /></svg>Filters{activeFilters.length > 0 && <span className="discovery-filter-count">{activeFilters.length}</span>}</button></div>
      <div className="discovery-categories" role="group" aria-label="Filter events by category">{categories.map(category => <button key={category} type="button" aria-pressed={filters.category === category} onClick={() => update({ category })}>{category}</button>)}</div>
      <div id="discovery-advanced" hidden={!expanded} className="discovery-advanced">
        <div className="discovery-options">
          <fieldset className="discovery-date-filter"><legend>When</legend><div className="discovery-date-options">{([{ value: "upcoming", label: "Upcoming" }, { value: "today", label: "Today" }, { value: "week", label: "Next 7 days" }] as const).map(option => <button key={option.value} type="button" aria-pressed={filters.when === option.value} onClick={() => update({ when: option.value })}>{option.label}</button>)}</div></fieldset>
          <div className="discovery-availability-field"><span>Availability</span><label className="discovery-availability"><span>Has open spots</span><input type="checkbox" role="switch" checked={filters.spotsOnly} onChange={event => update({ spotsOnly: event.target.checked })} /><span className="discovery-switch" aria-hidden="true" /></label></div>
        </div>
        <fieldset className="discovery-interests"><legend>Interests</legend>{availableTags.length ? <div className="tag-suggestions">{availableTags.map(tag => <button key={tag} type="button" className={filters.tags.includes(tag) ? "tag-chip selected" : "tag-chip"} aria-pressed={filters.tags.includes(tag)} disabled={!filters.tags.includes(tag) && filters.tags.length >= tagLimits.count} onClick={() => update({ tags: filters.tags.includes(tag) ? filters.tags.filter(item => item !== tag) : [...filters.tags, tag] })}>#{tag}</button>)}</div> : <p className="discovery-muted">Interest tags will appear when upcoming events include them.</p>}</fieldset>
      </div>
      {hasFilters && <div className="discovery-active" aria-label="Active filters">{activeFilters.map(filter => <button key={filter.label} type="button" onClick={filter.remove} aria-label={`Remove filter: ${filter.label}`}>{filter.label}<span aria-hidden="true">×</span></button>)}<button className="discovery-clear" type="button" onClick={clear}>Clear filters</button></div>}
    </section>
    <section aria-label="Event results" aria-busy={pending || loading}>
      <div className="discovery-results-heading"><p className="discovery-result-count" role="status">{pending ? "Loading events…" : error ? "Events couldn’t be loaded" : `${filteredEvents.length} ${filteredEvents.length === 1 ? "event" : "events"}`}</p><label className="discovery-sort"><span className="sr-only">Sort by</span><select value={sort} onChange={event => setSort(event.target.value as EventSort)}><option value="soonest">Soonest first</option><option value="newest">Newest first</option><option value="spots">Most open spots</option></select><svg className="discovery-sort-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></label></div>
      {error ? <div className="discovery-empty" role="alert"><h2>Couldn’t load events</h2><p>{error}</p>{onRetry && <button type="button" className="secondary" disabled={loading} onClick={() => void onRetry()}>{loading ? "Retrying…" : "Try again"}</button>}</div> : pending ? <div className="discovery-grid" aria-hidden="true">{[0, 1, 2, 3].map(key => <div className="discovery-skeleton" key={key}><span /><span /></div>)}</div> : filteredEvents.length ? <div className="discovery-grid">{filteredEvents.map(event => <EventCard key={event.id} event={event} variant="discovery" />)}</div> : <div className="discovery-empty"><h2>{upcoming.length ? "No matching events" : "No upcoming events"}</h2><p>{upcoming.length ? "Change your search or clear the filters to see more events." : "Create an event to make a plan on campus."}</p>{upcoming.length ? <button className="secondary" type="button" onClick={clear}>Clear filters</button> : <Link className="primary" href="/events/new">Create an event</Link>}</div>}
    </section>
  </div>;
}
