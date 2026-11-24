export const tagLimits = { count: 5, length: 24 } as const;
export const suggestedTags = ["first-years", "finals", "coffee", "board-games", "outdoors", "beginner-friendly"];

export function parseEventTags(input: string | readonly string[]): { ok: true; tags: string[] } | { ok: false; error: string } {
  const values = typeof input === "string" ? input.split(",") : input;
  const tags = [...new Set(values.filter((value) => value.trim()).map((value) => value.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-")))];
  if (tags.length > tagLimits.count) return { ok: false, error: `Choose up to ${tagLimits.count} tags.` };
  if (tags.some((tag) => tag.length > tagLimits.length || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag))) {
    return { ok: false, error: `Use letters a–z, numbers, and single hyphens. Each tag can have up to ${tagLimits.length} characters.` };
  }
  return { ok: true, tags };
}
