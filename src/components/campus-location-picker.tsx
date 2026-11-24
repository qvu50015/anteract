"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import "./campus-location-picker.css";
import { CampusMapPanel } from "./campus-map";
import {
  getCampusMap, getCampusSearchUrl, highlightParts, maxLocationLabel, normalizeLocationLabel,
  parseCampusShareLink, searchDemoPlaces, type CampusChoice, type CampusMapPlace,
} from "@/lib/campus-map";

type Option = { id: string; label: string; place?: CampusMapPlace };

function Highlight({ text, query }: { text: string; query: string }) {
  return <>{highlightParts(text, query).map((part, i) => part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>)}</>;
}
export function CampusLocationPicker({ value, onChange, label = "Where are you meeting?", hint = "Type a campus spot, like “Langson” or “ARC”." }: {
  value: CampusChoice | null;
  onChange: (choice: CampusChoice) => void;
  label?: string;
  hint?: string;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAfterChange = useRef(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mapSearch, setMapSearch] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState<CampusMapPlace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const showInput = !value || editing;
  const typed = normalizeLocationLabel(query);
  const matches = searchDemoPlaces(query);
  const options: Option[] = matches.map((place) => ({ id: `${uid}-pin-${place.markerId}`, label: place.label, place }));
  const sameAsMatch = matches.some((place) => place.label.toLowerCase() === typed.toLowerCase());
  if (typed.length >= 2 && !sameAsMatch) options.push({ id: `${uid}-text`, label: typed });
  const activeOption = open ? options[Math.min(active, options.length - 1)] : undefined;

  useEffect(() => {
    if (showInput && focusAfterChange.current) { focusAfterChange.current = false; inputRef.current?.focus(); setOpen(true); }
  }, [showInput]);

  function choose(choice: CampusChoice) {
    onChange(choice);
    setEditing(false); setOpen(false); setQuery(""); setActive(0);
    setPending(null); setMapSearch(""); setShareUrl(""); setDisplayName(""); setError("");
    setNotice(choice.place ? `${choice.label} selected. Check the pin on the map.` : `${choice.label} selected. It has no map pin.`);
  }

  function startChange() {
    focusAfterChange.current = true;
    setNotice(""); setEditing(true);
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!options.length) return;
      setOpen(true);
      setActive((current) => (current + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault(); // Enter picks a suggestion; it should never submit the surrounding form.
      if (activeOption) choose({ label: activeOption.label, place: activeOption.place });
    } else if (e.key === "Escape" && open) {
      e.preventDefault(); setOpen(false);
    }
  }

  function previewShareLink() {
    setNotice("");
    const link = parseCampusShareLink(shareUrl);
    const name = normalizeLocationLabel(displayName);
    if (!link) { setError("That doesn’t look like a place link from map.uci.edu. Use the Share button on a place, not a search."); return; }
    if (!name || name.length > maxLocationLabel) { setError(`Add the name people will see (up to ${maxLocationLabel} characters).`); return; }
    setError(""); setMapSearch("");
    setPending({ label: name, markerId: link.markerId });
  }

  // This section can sit inside a bigger form, so Enter here previews instead of submitting it.
  function importKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); previewShareLink(); }
  }

  const pinned = value?.place ? getCampusMap(undefined, value.place) : null;
  const map = pending
    ? { url: getCampusMap(undefined, pending).url, label: pending.label, note: "Is this the right spot? If so, confirm below. If not, try another link." }
    : mapSearch
      ? { url: getCampusSearchUrl(mapSearch), label: `Search: ${mapSearch}`, note: "Live results from UCI’s official map. Open a place, then use its Share button to copy the link." }
      : pinned && !showInput ? { url: pinned.url, label: value!.place!.label, note: "This pin marks the selected campus location. Add exact meeting instructions for the gathering spot." } : null;

  return (
    <section className="lp" aria-label="Choose event location">
      {showInput ? <label className="lp-label" htmlFor={`${uid}-input`}>{label}</label> : <p className="lp-label">{label}</p>}

      {value && !editing && (
        <div className="lp-selected">
          <span className="lp-pin" aria-hidden="true">⌖</span>
          <div><strong>{value.label}</strong><small>{value.place ? "Pinned on the official UCI map ✓" : "Name only · no map pin"}</small></div>
          <button className="secondary" type="button" onClick={startChange}>Change</button>
        </div>
      )}

      {showInput && (
        <div className="lp-combo">
          <div className="lp-input-row">
            <input
              id={`${uid}-input`} ref={inputRef} type="text" role="combobox" autoComplete="off" spellCheck={false} maxLength={maxLocationLabel}
              aria-expanded={open && options.length > 0} aria-controls={`${uid}-list`} aria-autocomplete="list" aria-describedby={`${uid}-hint`}
              aria-activedescendant={activeOption?.id} value={query} placeholder="Search campus spots"
              onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); setNotice(""); }}
              onFocus={() => setOpen(true)}
              onBlur={(e) => { if (!e.currentTarget.closest(".lp-combo")?.contains(e.relatedTarget)) setOpen(false); }}
              onKeyDown={keyDown}
            />
            {value && <button className="quiet-button" type="button" onClick={() => { setEditing(false); setOpen(false); setQuery(""); }}>Keep current</button>}
          </div>
          <p className="lp-hint" id={`${uid}-hint`}>{hint}</p>
          {open && options.length > 0 && (
            <ul className="lp-list" id={`${uid}-list`} role="listbox" aria-label="Location suggestions">
              {options.map((option, index) => (
                <li key={option.id} id={option.id} role="option" aria-selected={option === activeOption} className={option === activeOption ? "active" : undefined}
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose({ label: option.label, place: option.place })}>
                  <span className={option.place ? "lp-option-icon" : "lp-option-icon name-only"} aria-hidden="true">{option.place ? "⌖" : "✎"}</span>
                  <span className="lp-option-text">
                    {option.place ? <><strong><Highlight text={option.label} query={query} /></strong><small>Pinned on the official UCI map</small></>
                      : <><strong>Use “{option.label}”</strong><small>Shown as a name, without a map pin</small></>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="sr-only" role="status">{open ? `${options.length} ${options.length === 1 ? "suggestion" : "suggestions"} available. Use the up and down arrows, then Enter.` : ""}</p>
        </div>
      )}

      {showInput && (
        <details className="lp-more" onToggle={(e) => { if (e.currentTarget.open && !displayName) setDisplayName(typed); }}>
          <summary>Can’t find it? Pick any place from the official map</summary>
          <ol>
            <li><span>Search the map.</span><button className="secondary" type="button" disabled={typed.length < 2} onClick={() => { setPending(null); setMapSearch(typed); }}>{typed.length < 2 ? "Type a name above first" : `Search “${typed}” on the UCI map ↗`}</button></li>
            <li><span>Open the place on the map, press its <strong>Share</strong> icon, and copy the location link.</span></li>
            <li><span>Paste the link here and add the name people will see.</span></li>
          </ol>
          <div className="lp-import">
            <label htmlFor={`${uid}-name`}>Name shown on the event</label>
            <input id={`${uid}-name`} value={displayName} maxLength={maxLocationLabel} placeholder="e.g. Engineering Gateway" onChange={(e) => setDisplayName(e.target.value)} onKeyDown={importKey} />
            <label htmlFor={`${uid}-link`}>Location link from map.uci.edu</label>
            <input id={`${uid}-link`} type="url" value={shareUrl} placeholder="https://map.uci.edu/?id=463#!m/…" onChange={(e) => { setShareUrl(e.target.value); setPending(null); }} onKeyDown={importKey} />
            <button className="secondary" type="button" onClick={previewShareLink}>Preview this place</button>
          </div>
        </details>
      )}

      {error && <p className="lp-error" role="alert">{error}</p>}
      {map && <CampusMapPanel key={map.url} url={map.url} label={map.label} note={map.note} />}
      {pending && (
        <div className="lp-confirm"><div><strong>{pending.label}</strong><small>Check the pin above first.</small></div><button className="primary" type="button" onClick={() => choose({ label: pending.label, place: pending })}>Yes, use this place</button></div>
      )}
      <p className="lp-status" role="status">{notice}</p>
    </section>
  );
}