import type { CampusLocationId, CampusMapPlace } from "./campus-map";

export const categories = ["All", "Study", "Food", "Active"] as const;
export type Category = string;

export type Hangout = {
  id: string;
  title: string;
  category: Exclude<Category, "All">;
  location: string;
  campusLocationId?: CampusLocationId;
  campusMapPlace?: CampusMapPlace;
  time: string;
  startsAt?: string;
  tags?: string[];
  description: string;
  participants: number;
  capacity: number;
  hostId: string;
  attendeeIds: string[];
  meetingPoint: string;
  bring: string;
};

export const symbols = { Study: "✎", Food: "☕", Active: "↗" };

// Category labels are user content; only known safe tones become CSS classes.
export function eventCategoryTone(category: string): "study" | "food" | "active" | "custom" {
  const name = category.trim().toLowerCase();
  return name === "study" || name === "food" || name === "active" ? name : "custom";
}
export function eventCategorySymbol(category: string) {
  return { study: symbols.Study, food: symbols.Food, active: symbols.Active, custom: "✦" }[eventCategoryTone(category)];
}
