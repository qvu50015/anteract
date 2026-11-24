"use client";

import { parseEventTags, suggestedTags, tagLimits } from "@/lib/event-tags";

export function EventTagInput({ value, onChange, draft, onDraftChange, error, onError, disabled = false }: { value: string[]; onChange: (value: string[]) => void; draft: string; onDraftChange: (value: string) => void; error: string; onError: (error: string) => void; disabled?: boolean }) {
  function add(input: string) {
    const parsed = parseEventTags([...value, input]);
    if (!parsed.ok) { onError(parsed.error); return; }
    onChange(parsed.tags); onDraftChange(""); onError("");
  }
  function remove(tag: string) { onChange(value.filter(item => item !== tag)); onError(""); }
  return <div className="tag-editor creation-tags">
    <div className="creation-field-label"><label htmlFor="event-tags">Interest tags <span>(optional)</span></label><span>{value.length}/{tagLimits.count}</span></div>
    {value.length > 0 && <ul className="creation-tag-chips" aria-label="Selected interest tags">{value.map(tag => <li key={tag}><span>#{tag}</span><button type="button" disabled={disabled} aria-label={`Remove ${tag} tag`} onClick={() => remove(tag)}>×</button></li>)}</ul>}
    <div className="creation-tag-add"><input id="event-tags" value={draft} onChange={event => { onDraftChange(event.target.value); onError(""); }} disabled={disabled} aria-invalid={!!error} aria-describedby="event-tags-error" placeholder={value.length === tagLimits.count ? "All five tags added" : "Add an interest…"} maxLength={100} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); if (draft.trim()) add(draft); } }} /><button className="secondary" type="button" disabled={disabled || !draft.trim() || value.length >= tagLimits.count} onClick={() => add(draft)}>Add tag <span aria-hidden="true">+</span></button></div>

    <div className="tag-suggestions" aria-label="Suggested interest tags">{suggestedTags.map(tag => <button type="button" key={tag} className={`tag-chip ${value.includes(tag) ? "selected" : ""}`} aria-pressed={value.includes(tag)} disabled={disabled || (!value.includes(tag) && value.length >= tagLimits.count)} onClick={() => value.includes(tag) ? remove(tag) : add(tag)}>#{tag}</button>)}</div>
    <p id="event-tags-error" className="field-error" role={error ? "alert" : undefined}>{error}</p>
  </div>;
}
