export const guideSteps = [
  { id: "profile", title: "Set up your profile", instruction: "Save your name and at least one interest.", href: "/profile" },
  { id: "browse", title: "Browse events", instruction: "Look through upcoming activities on campus.", href: "/events" },
  { id: "join", title: "Join an event", instruction: "Open a plan with space and select Join event. Hosting counts too.", href: "/events" },
  { id: "plans", title: "Open My Events", instruction: "Find the time and meeting details for your plan.", href: "/my-events" },
] as const;

export type GuideStep = typeof guideSteps[number]["id"];
export type GuideProgress = Record<GuideStep, boolean> & { dismissed: boolean };

export function emptyGuideProgress(): GuideProgress {
  return { profile: false, browse: false, join: false, plans: false, dismissed: false };
}

export function guideStorageKey(userId: string) {
  return `anteract-quick-start-v1:${userId}`;
}

export function parseGuideProgress(value: string | null): GuideProgress {
  const result = emptyGuideProgress();
  try {
    const parsed: unknown = value ? JSON.parse(value) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result;
    for (const key of Object.keys(result) as (keyof GuideProgress)[]) {
      result[key] = key in parsed && (parsed as Record<string, unknown>)[key] === true;
    }
  } catch { /* A damaged preference must never block the app. */ }
  return result;
}

export function hasProfileBasics(profile: { display_name?: unknown; interests?: unknown } | null) {
  return !!profile && typeof profile.display_name === "string" && profile.display_name.trim().length >= 2
    && Array.isArray(profile.interests) && profile.interests.some(value => typeof value === "string" && !!value.trim());
}

/** A milestone records a completed action, even if the student later leaves a plan. */
export function applyGuideActivity(progress: GuideProgress, pathname: string, hasPlan: boolean): GuideProgress {
  const browse = progress.browse || hasPlan || pathname === "/events" || (pathname.startsWith("/events/") && pathname !== "/events/new");
  const join = progress.join || hasPlan;
  const plans = progress.plans || (hasPlan && pathname === "/my-events");
  return { ...progress, browse, join, plans };
}

export function sameGuideProgress(a: GuideProgress, b: GuideProgress) {
  return (Object.keys(a) as (keyof GuideProgress)[]).every(key => a[key] === b[key]);
}
