import type { Category } from "./hangouts";

export type EventFilters = {
  category: Category;
  query: string;
  tags: string[];
  when: "upcoming" | "today" | "week";
  spotsOnly: boolean;
};

export const defaultEventFilters: EventFilters = { category: "All", query: "", tags: [], when: "upcoming", spotsOnly: false };

type FilterableEvent = {
  category: string; title: string; location: string; description: string;
  tags?: readonly string[]; startsAt: string; participants: number; capacity: number;
};

export function filterEvents<T extends FilterableEvent>(events: readonly T[], filters: EventFilters, now = new Date()): T[] {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  if (filters.when === "week") end.setDate(end.getDate() + 6);
  const query = filters.query.trim().toLowerCase().replace(/^#/, "");
  const tagQuery = query.replace(/\s+/g, "-");
  return events.filter((event) => {
    const start = new Date(event.startsAt).getTime();
    if (!Number.isFinite(start) || start <= now.getTime()) return false;
    if (filters.when !== "upcoming" && start >= end.getTime()) return false;
    if (filters.category !== "All" && event.category.trim().replace(/\s+/g, " ").toLowerCase() !== filters.category.trim().replace(/\s+/g, " ").toLowerCase()) return false;
    if (filters.spotsOnly && event.participants >= event.capacity) return false;
    const tags = event.tags ?? [];
    if (!filters.tags.every((tag) => tags.includes(tag))) return false;
    return `${event.category} ${event.title} ${event.location} ${event.description} ${tags.join(" ")}`.toLowerCase().includes(query)
      || tags.some((tag) => tag.includes(tagQuery));
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function eventCategoryOptions(events: readonly { category: string }[], selected = "All") {
  const names = new Map<string, string>([["all", "All"], ["study", "Study"], ["food", "Food"], ["active", "Active"]]);
  for (const item of [...events.map(event => event.category), selected]) {
    const label = item.trim().replace(/\s+/g, " ");
    if (label && !names.has(label.toLowerCase())) names.set(label.toLowerCase(), label);
  }
  return [...names.values()];
}

export type EventSort = "soonest" | "newest" | "spots";

/** Sort a filtered snapshot without mutating the shared provider data. */
export function sortEvents<T extends { id: string; startsAt: string; createdAt?: string; participants: number; capacity: number }>(events: readonly T[], sort: EventSort): T[] {
  const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  return [...events].sort((a, b) => {
    const primary = sort === "newest" ? timestamp(b.createdAt) - timestamp(a.createdAt)
      : sort === "spots" ? Math.max(0, b.capacity - b.participants) - Math.max(0, a.capacity - a.participants) : 0;
    return primary || timestamp(a.startsAt) - timestamp(b.startsAt) || a.id.localeCompare(b.id);
  });
}
