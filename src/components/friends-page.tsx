"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { profilePhotoBucket } from "@/lib/profile";
import { activeFriendship, emptyPeopleFilters, splitFriendships, type FriendProfile, type Friendship, type PeopleFilters } from "@/lib/friend-discovery";
import { StudentConnectionCard } from "./student-connection-card";

const tabs = [{ id: "my-friends", label: "My Friends" }, { id: "requests", label: "Requests" }, { id: "find-students", label: "Find People" }] as const;
type Tab = typeof tabs[number]["id"];
const profileColumns = "id, display_name, major, class_year, interests, avatar_path";
const requestColumns = "id, sender_id, recipient_id, status, created_at";

function message(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "We couldn’t update your connections. Please try again.";
}

async function withPhotos(rows: Omit<FriendProfile, "photoUrl">[]): Promise<FriendProfile[]> {
  const supabase = createClient();
  return Promise.all(rows.map(async profile => {
    let photoUrl = "";
    if (profile.avatar_path) {
      const { data } = await supabase.storage.from(profilePhotoBucket).createSignedUrl(profile.avatar_path, 3600);
      photoUrl = data?.signedUrl ?? "";
    }
    return { ...profile, interests: profile.interests ?? [], photoUrl };
  }));
}

function ConnectionEmpty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="connection-empty"><span className="connection-empty-icon" aria-hidden="true">✦</span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export default function FriendsPage() {
  const [tab, setTab] = useState<Tab>("my-friends");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const feedback = useRef<HTMLParagraphElement>(null);
  const loadSequence = useRef(0);
  const searchSequence = useRef(0);
  const actionInFlight = useRef(false);
  const [userId, setUserId] = useState("");
  const [databaseRequests, setRequests] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, FriendProfile>>({});
  const [ownInterests, setOwnInterests] = useState<string[]>([]);
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<PeopleFilters>(emptyPeopleFilters);
  const [filters, setFilters] = useState<PeopleFilters>(emptyPeopleFilters);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const requests = databaseRequests;
  const interests = ownInterests;

  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setRefreshing(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Please log in to view your friends.");
      const [{ data, error: requestError }, { data: own, error: ownError }] = await Promise.all([
        supabase.from("friend_requests").select(requestColumns).or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).in("status", ["pending", "accepted"]).order("created_at", { ascending: false }),
        supabase.from("profiles").select("interests").eq("id", user.id).maybeSingle(),
      ]);
      if (requestError) throw requestError;
      if (ownError) throw ownError;
      const rows = (data ?? []) as Friendship[];
      const ids = [...new Set(rows.flatMap(row => [row.sender_id, row.recipient_id]).filter(id => id !== user.id))];
      let people: FriendProfile[] = [];
      if (ids.length) {
        const { data: found, error: profileError } = await supabase.from("profiles").select(profileColumns).in("id", ids);
        if (profileError) throw profileError;
        people = await withPhotos(found ?? []);
      }
      if (sequence !== loadSequence.current) return;
      setUserId(user.id); setRequests(rows);
      setProfiles(Object.fromEntries(people.map(person => [person.id, person])));
      setOwnInterests(own?.interests ?? []); setReady(true); setLoadError("");
    } catch (loadFailure) {
      if (sequence === loadSequence.current) setLoadError(message(loadFailure));
    } finally {
      if (sequence === loadSequence.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    const syncTab = () => { const hash = window.location.hash.slice(1); if (tabs.some(item => item.id === hash)) setTab(hash as Tab); };
    syncTab(); window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { if (!document.hidden && !actionInFlight.current) void refresh(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => { ++loadSequence.current; ++searchSequence.current; window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { if (notice) feedback.current?.focus({ preventScroll: true }); }, [notice]);

  function selectTab(next: Tab, focus = false) {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
    if (focus) tabRefs.current[tabs.findIndex(item => item.id === next)]?.focus();
    if (!actionInFlight.current) void refresh();
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); selectTab(tabs[next].id, true);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim().replace(/[%_,()]/g, " ").trim();
    const sequence = ++searchSequence.current;
    setResults([]); setSearchError(""); setSearchedQuery(term); setHasSearched(true);
    const selection = { ...filters, major: filters.major.trim() };
    setAppliedFilters(selection);
    setSearching(true);
    try {
      let request = createClient().from("profiles").select(profileColumns).neq("id", userId);
      if (term) request = request.ilike("display_name", `%${term}%`);
      if (selection.major) request = request.eq("major", selection.major);
      if (selection.year) request = request.eq("class_year", selection.year);
      if (selection.sharedOnly) request = request.overlaps("interests", interests);
      const { data, error: queryError } = await request.order("display_name").limit(30);
      if (queryError) throw queryError;
      const found = await withPhotos(data ?? []);
      if (sequence === searchSequence.current) setResults(found);
    } catch (searchFailure) {
      if (sequence === searchSequence.current) setSearchError(message(searchFailure));
    } finally { if (sequence === searchSequence.current) setSearching(false); }
  }

  async function act(profile: FriendProfile, request?: Friendship, accept?: boolean) {
    if (actionInFlight.current || !ready) return;
    actionInFlight.current = true; ++loadSequence.current;
    setRefreshing(false); setBusyId(profile.id); setError(""); setNotice("");
    try {
      const supabase = createClient();
      const response = request
        ? await supabase.from("friend_requests").update({ status: accept ? "accepted" : "rejected" }).eq("id", request.id).eq("recipient_id", userId).eq("status", "pending").select(requestColumns).maybeSingle()
        : await supabase.from("friend_requests").insert({ sender_id: userId, recipient_id: profile.id }).select(requestColumns).single();
      if (response.error) throw response.error;
      if (!response.data) throw new Error("This request has already changed. Refresh your connections and try again.");
      const saved = response.data as Friendship;
      // Confirmed writes update every tab immediately, independent of a follow-up fetch.
      setRequests(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      setProfiles(current => ({ ...current, [profile.id]: profile }));
      setNotice(request ? accept ? `You and ${profile.display_name} are now friends.` : `Request from ${profile.display_name} declined.` : `Friend request sent to ${profile.display_name}.`);
    } catch (failure) {
      setError(message(failure));
      await refresh();
    } finally { actionInFlight.current = false; setBusyId(""); }
  }

  const { received, sent, friends } = splitFriendships(requests, userId);
  const filtered = results;
  const majors = [...new Set(results.map(person => person.major).filter(Boolean))].sort();
  const years = ["First year", "Second year", "Third year", "Fourth year", "Graduate student"];
  const filtersActive = !!filters.major || !!filters.year || filters.sharedOnly;

  function actions(profile: FriendProfile) {
    const relationship = activeFriendship(requests, userId, profile.id);
    const busy = busyId === profile.id;
    if (relationship?.status === "accepted") return <><span className="connection-status connected">✓ Friends</span><Link className="secondary" href={`/chat/${profile.id}`}>Message <span className="sr-only">{profile.display_name}</span><span aria-hidden="true">↗</span></Link></>;
    if (relationship?.status === "pending") return relationship.recipient_id === userId
      ? <><button className="primary" disabled={!!busyId} onClick={() => void act(profile, relationship, true)}>{busy ? "Updating…" : "Accept"}</button><button className="secondary" disabled={!!busyId} onClick={() => void act(profile, relationship, false)}>Decline</button></>
      : <span className="connection-status pending"><span aria-hidden="true">◷</span> Pending</span>;
    return <button className="primary" disabled={!!busyId || !ready} onClick={() => void act(profile)}>{busy ? "Sending…" : "Add friend"}<span aria-hidden="true">+</span></button>;
  }
  function card(profile: FriendProfile) { return <StudentConnectionCard key={profile.id} profile={profile} ownInterests={interests}>{actions(profile)}</StudentConnectionCard>; }
  function requestCards(rows: Friendship[]) {
    return <div className="connections-grid">{rows.map(request => {
      const id = request.sender_id === userId ? request.recipient_id : request.sender_id;
      return profiles[id] ? card(profiles[id]) : <div className="connection-unavailable" key={request.id}>This student’s profile is currently unavailable.</div>;
    })}</div>;
  }

  return <div className="friends-page connections-page">
    <div className="connections-tab-row"><div className="connections-tabs" role="tablist" aria-label="Your connections">{tabs.map((item, index) => <button key={item.id} ref={element => { tabRefs.current[index] = element; }} id={`tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => selectTab(item.id)} onKeyDown={event => tabKey(event, index)}>{item.label}{item.id === "requests" && received.length > 0 && <span className="request-badge" aria-label={`${received.length} incoming pending requests`}>{received.length}</span>}</button>)}</div></div>
    {loadError && <div className="connections-feedback"><p role="alert">{ready ? "Your connections couldn’t refresh. Showing the last loaded state. " : ""}{loadError}</p><button className="secondary" type="button" disabled={refreshing} onClick={() => void refresh()}>Try again</button></div>}
    {error && <p className="connections-feedback error" role="alert">{error}</p>}
    {notice && <p ref={feedback} tabIndex={-1} className="connections-feedback success" role="status">{notice}</p>}
    {loading && <p className="loading-state" role="status">Finding your connections…</p>}
    {!loading && ready && <>
      <section id="my-friends" role="tabpanel" aria-labelledby="tab-my-friends" tabIndex={0} hidden={tab !== "my-friends"} className="friends-tab-panel">
        <div className="connections-section-heading"><div><h2>Friends <span>{friends.length}</span></h2></div></div>
        {friends.length ? requestCards(friends) : <ConnectionEmpty title="Your circle starts with a hello." action={<button className="primary" onClick={() => selectTab("find-students", true)}>Find People <span aria-hidden="true">↗</span></button>}></ConnectionEmpty>}
      </section>
      <section id="requests" role="tabpanel" aria-labelledby="tab-requests" tabIndex={0} hidden={tab !== "requests"} className="friends-tab-panel">
        <div className="connections-section-heading"><div><h2>Received <span>{received.length}</span></h2></div></div>
        {received.length ? requestCards(received) : <ConnectionEmpty title="You’re all caught up."></ConnectionEmpty>}
        <div className="connections-section-heading sent-heading"><div><h2>Sent <span>{sent.length}</span></h2></div></div>
        {sent.length ? requestCards(sent) : <ConnectionEmpty title="No pending requests.">Find someone you’d like to know and send your first hello.</ConnectionEmpty>}
      </section>
      <section id="find-students" role="tabpanel" aria-labelledby="tab-find-students" tabIndex={0} hidden={tab !== "find-students"} className="friends-tab-panel">
        <div className="connections-section-heading"><div><h2>Find your fellow Anteaters</h2></div></div>
        <form className="people-search" onSubmit={event => void search(event)}><label htmlFor="friend-search">Search UCI students by name</label><div className="people-search-bar"><span aria-hidden="true">⌕</span><input id="friend-search" type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a name…" autoComplete="off" /><button className="primary" type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button></div>
        <fieldset className="people-filters" disabled={searching}><legend>Filter students</legend><label>Major<input list="people-major-options" maxLength={100} value={filters.major} onChange={event => setFilters(current => ({ ...current, major: event.target.value }))} placeholder="Any major" /><datalist id="people-major-options">{majors.map(major => <option key={major} value={major} />)}</datalist></label><label>Class year<select aria-label="Class year" value={filters.year} onChange={event => setFilters(current => ({ ...current, year: event.target.value }))}><option value="">All years</option>{years.map(year => <option key={year}>{year}</option>)}</select></label><label className="shared-filter"><input type="checkbox" checked={filters.sharedOnly} disabled={!interests.length} onChange={event => setFilters(current => ({ ...current, sharedOnly: event.target.checked }))} />Shared interests</label>{filtersActive && <button className="quiet-button" type="button" onClick={() => setFilters(emptyPeopleFilters)}>Clear filters</button>}{!interests.length && <p className="filter-profile-hint"><Link href="/profile">Add interests to your profile</Link> to find things in common.</p>}</fieldset><p className="filter-profile-hint">Choose filters, then select Search. Leave the name blank to browse students.</p></form>
        {searching ? <p className="loading-state" role="status">Looking for students…</p> : searchError ? <p className="connections-feedback error" role="alert">{searchError} Try searching again.</p> : !hasSearched ? <ConnectionEmpty title="Who would you like to meet?"></ConnectionEmpty> : <><p className="people-result-count" role="status">{filtered.length} {filtered.length === 1 ? "student" : "students"} {searchedQuery ? `for “${searchedQuery}”` : "matching your search"}{results.length === 30 ? " · Showing up to 30 matches. Refine your search to find more." : ""}</p>{filtered.length ? <div className="connections-grid">{filtered.map(card)}</div> : <ConnectionEmpty title={appliedFilters.major || appliedFilters.year || appliedFilters.sharedOnly ? "No matches with these filters." : "No students found just yet."} action={<button className="secondary" onClick={() => { setFilters(emptyPeopleFilters); setHasSearched(false); }}>Start a new search</button>}>{appliedFilters.major || appliedFilters.year || appliedFilters.sharedOnly ? "Try another major, class year, or interest selection." : "Check the spelling or try a shorter name."}</ConnectionEmpty>}</>}
      </section>
    </>}
  </div>;
}
