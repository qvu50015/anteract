import { eventCategoryTone, eventCategorySymbol } from "@/lib/hangouts";
import type { NewEventInput } from "@/lib/new-event";

export type EventPreviewDraft = Omit<NewEventInput, "capacity"> & { capacity: string };

export function EventDraftPreview({ draft }: { draft: EventPreviewDraft }) {
  const date = draft.startsAt ? new Date(draft.startsAt) : null;
  const when = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : "Choose a date & time";
  const capacity = Number(draft.capacity);
  return <article className="card event-draft-preview" aria-label="Event card preview">
    <div className={`card-art ${eventCategoryTone(draft.category)}`}><span aria-hidden="true">{eventCategorySymbol(draft.category)}</span><span className="category-label">{draft.category}</span></div>
    <div className="card-body"><p className="time">{when}</p><h3>{draft.title.trim() || "Your event title"}</h3><p className="location"><span aria-hidden="true">⌖</span> {draft.location.trim() || "Choose a campus location"}</p><p className="description">{draft.description.trim() || "Tell fellow Anteaters what you have planned."}</p>
      {!!draft.tags?.length && <ul className="event-tags" aria-label="Preview interest tags">{draft.tags.map(tag => <li key={tag}><span>#{tag}</span></li>)}</ul>}
      <div className="host-line"><span className="avatar tiny blue" aria-hidden="true">You</span><span>Organized by you</span></div>
      {draft.meetingPoint.trim() && <p className="event-preview-detail"><strong>Meeting point</strong>{draft.meetingPoint}</p>}
      {draft.bring.trim() && <p className="event-preview-detail"><strong>What to bring</strong>{draft.bring}</p>}
      <div className="card-footer"><span>{Number.isInteger(capacity) && capacity >= 2 && capacity <= 50 ? `1/${capacity} going · including you` : "Choose a group size"}</span><span className="event-preview-unpublished">Not published</span></div>
    </div>
  </article>;
}
