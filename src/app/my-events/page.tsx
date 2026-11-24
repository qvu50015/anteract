"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { EventCard } from "@/components/event-card";
import { useEvents } from "@/components/event-provider";
import { EVENT_POINTS, groupMyEvents, pointsProgress } from "@/lib/my-events";

const tabs = [
  { id: "upcoming", label: "Upcoming", summary: "Upcoming events", icon: "/upcoming.png", detail: "Your next campus plans", empty: "Your next plan is out there.", message: "Find something you’re into and make it part of your week.", href: "/events", action: "Browse events" },
  { id: "hosting", label: "Hosting", summary: "Events hosting", icon: "/events.jpg", detail: "Plans you’ve brought together", empty: "Make the first move.", message: "A study session, a coffee break, a walk around campus. Start a plan of your own.", href: "/events/new", action: "Create an event" },
  { id: "past", label: "Past", summary: "Past events", icon: "/past_icon.png", detail: "A look back at your plans", empty: "Your event history starts here.", message: "Past events you joined or hosted will appear here.", href: "", action: "" },
] as const;
type Tab = typeof tabs[number]["id"];

export default function MyEvents() {
  const { events, loading, error, refresh } = useEvents();
  const [active, setActive] = useState<Tab>("upcoming");
  const [now, setNow] = useState<number | null>(null);
  const controls = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const groups = groupMyEvents(events, now ?? 0);
  const rewards = pointsProgress(groups.past.length * EVENT_POINTS);
  const pending = now === null || (loading && events.length === 0);
  const unavailable = !!error && events.length === 0;

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setActive(tabs[next].id);
    controls.current[next]?.focus();
  }

  return <div className="my-events-dashboard">
    <header className="my-events-heading"><h1>My events</h1><Link className="primary" href="/events/new"><span aria-hidden="true">+</span> Create an event</Link></header>
    <dl className="my-events-overview" aria-label="Your event overview">{tabs.map(tab => <div key={tab.id} className={`my-events-stat ${tab.id}`}><dt><span className="my-events-stat-icon" aria-hidden="true"><img className="my-events-category-icon" src={tab.icon} alt="" width="38" height="38" /></span>{tab.summary}</dt><dd>{pending || unavailable ? <span aria-label="Count unavailable">—</span> : groups[tab.id].length}</dd></div>)}</dl>
    <section className={`event-rewards tier-${rewards.tier.toLowerCase().replaceAll(" ", "-")}`} aria-labelledby="event-rewards-title" aria-busy={pending}>
      <div className="event-rewards-copy">
        <p className="event-rewards-eyebrow">Your campus impact</p>
        <h2 id="event-rewards-title">{pending || unavailable ? "Event rewards" : `${rewards.tier} ${rewards.tier === "Getting started" ? "journey" : "tier"}`}</h2>
        <p>{pending || unavailable ? "Your points are currently unavailable." : `${rewards.points} points · ${EVENT_POINTS} points for each past event you joined or hosted.`}</p>
        <details className="event-rewards-help"><summary>How points work</summary><p>A joined or hosted plan adds {EVENT_POINTS} points once its start time has passed. Points reflect your current event history; they don’t verify attendance. Leaving a plan or having it canceled can change your total.</p><Link className="text-link" href="/help#points">More about event rewards ↗</Link></details>
      </div>
      <div className="event-rewards-progress">
        <div className="event-rewards-label"><strong>{pending || unavailable ? "—" : `${rewards.points} pts`}</strong><span>{pending || unavailable ? "—" : rewards.nextTier === null ? "Top tier reached" : `${rewards.pointsToNextTier} to ${rewards.nextTier === 200 ? "Silver" : rewards.nextTier === 350 ? "Gold" : "Bronze"}`}</span></div>
        <div className="event-rewards-track" role="progressbar" aria-label="Progress toward the next event reward tier" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pending || unavailable ? 0 : Math.round(rewards.progress)}><span style={{ width: `${pending || unavailable ? 0 : rewards.progress}%` }} /></div>
        <div className="event-rewards-tiers"><span className={rewards.points >= 100 ? "earned" : ""}>Bronze · 100</span><span className={rewards.points >= 200 ? "earned" : ""}>Silver · 200</span><span className={rewards.points >= 350 ? "earned" : ""}>Gold · 350</span></div>
      </div>
    </section>
    {error && <div className="my-events-error" role="alert"><div><strong>{unavailable ? "Your events couldn’t be loaded." : "Couldn’t refresh your events. Showing the last loaded plans."}</strong><p>{error}</p></div><button className="secondary" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Retrying…" : "Try again"}</button></div>}
    <div className="my-events-tabs" role="tablist" aria-label="My event lists">{tabs.map((tab, index) => <button key={tab.id} ref={element => { controls.current[index] = element; }} type="button" role="tab" id={`my-events-tab-${tab.id}`} aria-controls={`my-events-panel-${tab.id}`} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={event => navigateTabs(event, index)}>{tab.label}<span aria-hidden="true">{pending || unavailable ? "—" : groups[tab.id].length}</span></button>)}</div>
    {loading && !pending && <p className="my-events-updating" role="status">Updating your plans…</p>}
    {tabs.map(tab => <section key={tab.id} id={`my-events-panel-${tab.id}`} role="tabpanel" aria-labelledby={`my-events-tab-${tab.id}`} tabIndex={0} hidden={active !== tab.id} className="my-events-panel" aria-busy={loading}>
      {pending ? <div className="my-events-loading"><p role="status">Loading your plans…</p><div className="my-events-grid" aria-hidden="true">{[0, 1, 2].map(key => <div className="my-event-skeleton" key={key}><span /><span /><span /></div>)}</div></div> : unavailable ? null : <>
        <div className="my-events-list-heading"><h2>{tab.detail}</h2></div>
        {groups[tab.id].length ? <div className="my-events-grid">{groups[tab.id].map(event => <EventCard key={event.id} event={event} variant="personal" past={Date.parse(event.startsAt) <= (now ?? 0)} />)}</div> : <div className="my-events-empty"><span className="my-events-empty-icon" aria-hidden="true"><img className="my-events-category-icon" src={tab.icon} alt="" width="38" height="38" /></span><h2>{tab.empty}</h2><p>{tab.message}</p>{tab.href && <Link className={tab.id === "hosting" ? "primary" : "secondary"} href={tab.href}>{tab.action}<span aria-hidden="true">↗</span></Link>}</div>}
      </>}
    </section>)}
  </div>;
}
