"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEvents } from "./event-provider";
import { createClient } from "@/lib/supabase/client";
import { applyGuideActivity, emptyGuideProgress, guideStorageKey, hasProfileBasics, parseGuideProgress, sameGuideProgress, type GuideProgress } from "@/lib/getting-started";

type GuideState = { userId: string; progress: GuideProgress; persistent: boolean };
type GuideContextValue = {
  ready: boolean;
  progress: GuideProgress;
  persistent: boolean;
  setDismissed: (dismissed: boolean) => void;
  completeProfile: (profile: { id: string; display_name?: unknown; interests?: unknown }) => void;
};
const GuideContext = createContext<GuideContextValue | null>(null);

export function GettingStartedProvider({ children }: { children: ReactNode }) {
  const { userId, events, loading, error } = useEvents();
  const pathname = usePathname();
  const [state, setState] = useState<GuideState>({ userId: "", progress: emptyGuideProgress(), persistent: true });
  const current = useRef(state);

  const update = useCallback((id: string, transition: (progress: GuideProgress) => GuideProgress) => {
    const previous = current.current;
    if (!id || previous.userId !== id) return;
    const progress = transition(previous.progress);
    if (sameGuideProgress(previous.progress, progress)) return;
    let persistent = previous.persistent;
    try { localStorage.setItem(guideStorageKey(id), JSON.stringify(progress)); persistent = true; }
    catch { persistent = false; }
    const next = { userId: id, progress, persistent };
    current.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let active = true;
    // Account changes never reuse another student's guide preferences.
    let progress = emptyGuideProgress();
    let persistent = true;
    if (userId) {
      try { progress = parseGuideProgress(localStorage.getItem(guideStorageKey(userId))); }
      catch { persistent = false; }
    }
    const next = { userId, progress, persistent };
    current.current = next;
    setState(next);

    function sync(event: StorageEvent) {
      if (!userId || (event.key !== null && event.key !== guideStorageKey(userId))) return;
      let latest: GuideProgress;
      try { latest = parseGuideProgress(localStorage.getItem(guideStorageKey(userId))); }
      catch { return; }
      const synced = { userId, progress: latest, persistent: true };
      current.current = synced;
      setState(synced);
    }
    window.addEventListener("storage", sync);
    if (userId) void (async () => {
      try {
        const { data, error: profileError } = await createClient().from("profiles").select("display_name, interests").eq("id", userId).maybeSingle();
        if (active && !profileError && hasProfileBasics(data)) update(userId, value => ({ ...value, profile: true }));
      } catch { /* Profile editing remains available if this optional check fails. */ }
    })();
    return () => { active = false; window.removeEventListener("storage", sync); };
  }, [userId, update]);

  const hasPlan = events.some(event => event.isJoined || event.isHost);
  useEffect(() => {
    if (!loading && !error) update(userId, progress => applyGuideActivity(progress, pathname, hasPlan));
  }, [userId, pathname, hasPlan, loading, error, update]);

  const completeProfile = useCallback((profile: { id: string; display_name?: unknown; interests?: unknown }) => {
    if (hasProfileBasics(profile)) update(profile.id, progress => ({ ...progress, profile: true }));
  }, [update]);

  return <GuideContext.Provider value={{
    ready: !!userId && state.userId === userId,
    progress: state.userId === userId ? state.progress : emptyGuideProgress(),
    persistent: state.persistent,
    setDismissed: dismissed => update(userId, progress => ({ ...progress, dismissed })),
    completeProfile,
  }}>{children}</GuideContext.Provider>;
}

export function useGettingStarted() {
  const guide = useContext(GuideContext);
  if (!guide) throw new Error("useGettingStarted must be used inside GettingStartedProvider");
  return guide;
}
