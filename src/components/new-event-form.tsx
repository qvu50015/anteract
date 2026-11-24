"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { EventTagInput } from "./event-tag-input";
import { parseEventTags } from "@/lib/event-tags";
import { symbols } from "@/lib/hangouts";
import { combineEventDateTime, eventCategoryNames, eventLimits, validateNewEvent, type NewEventField, type RawNewEvent } from "@/lib/new-event";
import { useEvents } from "./event-provider";
import { getCampusMap, resolveCampusLocation, searchCampusLocations } from "@/lib/campus-map";
import { CampusMapPanel } from "./campus-map";
import { EventDraftPreview } from "./event-draft-preview";

const initial: RawNewEvent = { title: "", category: "Study", description: "", location: "", startsAt: "", meetingPoint: "", bring: "", capacity: "5" };
const fieldIds: Record<NewEventField, string> = { title: "event-title", category: "event-category", description: "event-description", location: "event-location", startsAt: "event-date", meetingPoint: "meeting-point", bring: "event-bring", capacity: "event-capacity" };

export default function NewEventForm() {
  const router = useRouter();
  const { createEvent } = useEvents();
  const [draft, setDraft] = useState(initial);
  const [customCategory, setCustomCategory] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState("");
  const [touched, setTouched] = useState<Partial<Record<NewEventField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const selectedLocation = resolveCampusLocation(draft.location);
  const selectedMap = getCampusMap(undefined, undefined, draft.location);
  const startsAt = combineEventDateTime(date, time);
  const raw = { ...draft, location: selectedLocation?.label ?? draft.location, startsAt };
  const validation = validateNewEvent(raw);
  const errors = validation.ok ? {} : validation.errors;
  const preview = { ...raw, category: draft.category.trim() || "Your category", tags };

  function openPicker(input: HTMLInputElement) {
    // Native picker support differs by browser; ordinary typing remains available.
    try { input.showPicker?.(); } catch {}
  }
  function edit(field: NewEventField, value: string) { setDraft(current => ({ ...current, [field]: value })); setError(""); }
  function fieldError(field: NewEventField) { return submitted || touched[field] ? errors[field] : undefined; }
  function touch(field: NewEventField) { setTouched(current => ({ ...current, [field]: true })); }
  function attributes(field: NewEventField) {
    return { "aria-invalid": !!fieldError(field), "aria-describedby": `${fieldIds[field]}-error`, onBlur: () => touch(field) };
  }
  function fieldFeedback(field: NewEventField) { return <p id={`${fieldIds[field]}-error`} className="field-error" aria-live="polite">{fieldError(field)}</p>; }
  function step(amount: number) {
    const value = Number(draft.capacity);
    edit("capacity", String(Math.min(eventLimits.capacity.max, Math.max(eventLimits.capacity.min, (Number.isFinite(value) ? Math.round(value) : 5) + amount))));
    touch("capacity");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || published) return;
    setSubmitted(true); setError("");
    const checked = validateNewEvent(raw);
    const checkedTags = parseEventTags([...tags, tagDraft]);
    if (!checkedTags.ok) setTagError(checkedTags.error);
    if (!checked.ok) {
      const first = Object.keys(checked.errors)[0] as NewEventField;
      document.getElementById(first === "category" && customCategory ? "event-custom-category" : first === "startsAt" && date ? "event-time" : fieldIds[first])?.focus();
      return;
    }
    if (!checkedTags.ok) { document.getElementById("event-tags")?.focus(); return; }
    setTags(checkedTags.tags); setTagDraft(""); setTagError("");
    busy.current = true; setSaving(true);
    try {
      const id = await createEvent({ ...checked.value, tags: checkedTags.tags });
      setPublished(true);
      router.push(`/events/${id}`);
    } catch (failure) {
      busy.current = false; setPublished(false);
      if (failure && typeof failure === "object" && "message" in failure && typeof failure.message === "string" && failure.message.includes("events_category_check")) {
        setError("Custom categories need a database update. Apply the custom event categories migration, then try again.");
      } else setError(failure && typeof failure === "object" && "message" in failure && typeof failure.message === "string" ? failure.message : "Could not create the event. Please try again.");
    } finally { setSaving(false); }
  }
  return <section className="event-creation-page">
    <Link className="back-link event-back-link" href="/events">
      <span className="event-back-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 5-7 7 7 7M5 12h14" /></svg></span>
      <span>Browse events</span>
    </Link>
    <header className="event-creation-heading"><div><h1>Create an event</h1><p className="creation-limit-note">You can post up to 3 events each day (UTC).</p></div><button ref={previewButton} className="secondary event-mobile-preview" type="button" onClick={() => previewDialog.current?.showModal()}>Preview <span aria-hidden="true">↗</span></button></header>
    <div className="event-creation-layout">
      <form className="event-creation-form" aria-busy={saving} noValidate onSubmit={event => void submit(event)}>
        <fieldset disabled={saving || published} className="event-form-section"><legend><span>01</span> Event Basics</legend>
          <div className="creation-field"><div className="creation-field-label"><label htmlFor="event-title">Event title</label><span>{draft.title.length}/{eventLimits.title.max}</span></div><input id="event-title" name="title" required minLength={3} maxLength={100} placeholder="Give your plan a name" value={draft.title} onChange={event => edit("title", event.target.value)} {...attributes("title")} />{fieldFeedback("title")}</div>
          <fieldset className="creation-category"><legend id="event-category">Category</legend><div>{eventCategoryNames.map(category => <label key={category} className={!customCategory && draft.category === category ? "selected" : ""}><input type="radio" name="category" value={category} checked={!customCategory && draft.category === category} onChange={() => { setCustomCategory(false); edit("category", category); }} /><span aria-hidden="true">{symbols[category]}</span>{category}</label>)}<label className={customCategory ? "selected" : ""}><input type="radio" name="category" value="custom" checked={customCategory} onChange={() => { setCustomCategory(true); edit("category", ""); }} /><span aria-hidden="true">✦</span>Custom</label></div>{customCategory && <div className="creation-custom-category"><label htmlFor="event-custom-category">Your category</label><input id="event-custom-category" name="custom_category" required minLength={2} maxLength={40} placeholder="e.g. Gaming, Arts, Volunteering" value={draft.category} onChange={event => edit("category", event.target.value)} {...attributes("category")} /></div>}{fieldFeedback("category")}</fieldset>
          <div className="creation-field"><label htmlFor="event-description">Description</label><textarea id="event-description" name="description" required minLength={10} maxLength={1000} rows={4} placeholder="What will you do together?" value={draft.description} onChange={event => edit("description", event.target.value)} {...attributes("description")} /><div className="creation-field-label"><span>{draft.description.length}/1000</span></div>{fieldFeedback("description")}</div>
          <EventTagInput value={tags} onChange={setTags} draft={tagDraft} onDraftChange={setTagDraft} error={tagError} onError={setTagError} disabled={saving || published} />
        </fieldset>
        <fieldset disabled={saving || published} className="event-form-section"><legend><span>02</span> When &amp; Where</legend>
          <div className="creation-field"><label htmlFor="event-location">Campus location</label><div className="creation-location-input"><span aria-hidden="true">⌕</span><input id="event-location" name="location" required minLength={2} maxLength={120} placeholder="Search a building, e.g. ARC or Langson" value={draft.location} onChange={event => edit("location", event.target.value)} list="event-location-suggestions" autoComplete="off" {...attributes("location")} aria-describedby={`event-location-tip${fieldError("location") ? " event-location-error" : ""}`} /></div><datalist id="event-location-suggestions">{searchCampusLocations(draft.location).map(place => <option key={place.label} value={place.label}>{place.aliases.join(" · ")}</option>)}</datalist><p className="creation-hint" id="event-location-tip">Choose a suggestion, then check the map preview. Add the exact entrance or gathering spot below. <Link className="text-link" href="/help#locations">Location tips ↗</Link></p>{fieldFeedback("location")}</div>
          {selectedLocation && <details className="creation-location-map"><summary><span aria-hidden="true">⌖</span> {selectedMap.location ? "Verified map pin" : "UCI building search"} · Preview map</summary><CampusMapPanel url={selectedMap.url} label={selectedLocation.label} note={selectedMap.location?.note ?? "Find this building in the official UCI map search results. Add exact meeting instructions below."} /></details>}
          <div className="creation-schedule"><div className="creation-date-time"><div className="creation-field"><label htmlFor="event-date">Date</label><input id="event-date" name="event_date" type="date" onClick={event => openPicker(event.currentTarget)} required value={date} onChange={event => { setDate(event.target.value); setError(""); }} {...attributes("startsAt")} /></div><div className="creation-field"><label htmlFor="event-time">Time</label><input id="event-time" name="event_time" type="time" onClick={event => openPicker(event.currentTarget)} required value={time} onChange={event => { setTime(event.target.value); setError(""); }} {...attributes("startsAt")} /></div></div>{fieldFeedback("startsAt")}</div>
          <div className="creation-field"><label htmlFor="meeting-point">Meeting point details <span>(optional)</span></label><input id="meeting-point" name="meeting_point" maxLength={300} placeholder="Outside the main entrance, by the benches" value={draft.meetingPoint} onChange={event => edit("meetingPoint", event.target.value)} {...attributes("meetingPoint")} />{fieldFeedback("meetingPoint")}</div>
        </fieldset>
        <fieldset disabled={saving || published} className="event-form-section"><legend><span>03</span> Group Details</legend>
          <div className="creation-group-size"><div><label htmlFor="event-capacity">Group size</label></div><div className="creation-stepper"><button type="button" aria-label="Decrease group size" disabled={Number(draft.capacity) <= 2} onClick={() => step(-1)}>−</button><input id="event-capacity" name="capacity" type="number" required min={2} max={50} step={1} value={draft.capacity} onChange={event => edit("capacity", event.target.value)} {...attributes("capacity")} /><button type="button" aria-label="Increase group size" disabled={Number(draft.capacity) >= 50} onClick={() => step(1)}>+</button></div></div>{fieldFeedback("capacity")}
          <div className="creation-field"><label htmlFor="event-bring">What to bring <span>(optional)</span></label><input id="event-bring" name="bring" maxLength={300} placeholder="Anything students should have with them" value={draft.bring} onChange={event => edit("bring", event.target.value)} {...attributes("bring")} />{fieldFeedback("bring")}</div>
        </fieldset>
        {error && <p className="entry-notice" role="alert">{error}</p>}
        {submitted && !validation.ok && <p className="creation-submit-error" role="alert">Check the highlighted fields before publishing.</p>}
        <div className="creation-publish"><button className="primary" type="submit" disabled={saving || published}>{published ? "Event created ✓" : saving ? "Creating event…" : "Create event"}<span aria-hidden="true">↗</span></button></div>
        {(saving || published) && <p role="status" className="creation-hint">{published ? "Event created. Opening your event…" : "Publishing your plan…"}</p>}
      </form>
      <aside className="event-desktop-preview" tabIndex={0} aria-label="Live event preview"><div className="event-preview-heading"><span className="eyebrow">LIVE PREVIEW</span></div><EventDraftPreview draft={preview} /></aside>
    </div>
    <dialog ref={previewDialog} className="event-preview-dialog" aria-labelledby="event-preview-title" onClose={() => previewButton.current?.focus()}><div className="event-preview-dialog-heading"><h2 id="event-preview-title">Event preview</h2><button className="secondary" type="button" autoFocus onClick={() => previewDialog.current?.close()}>Close <span aria-hidden="true">×</span></button></div><EventDraftPreview draft={preview} /></dialog>
  </section>;
}
