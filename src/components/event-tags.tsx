import Link from "next/link";

export function EventTags({ tags = [], browsePath = "/events" }: { tags?: readonly string[]; browsePath?: string }) {
  if (!tags.length) return null;
  return <ul className="event-tags" aria-label="Event tags">{tags.map((tag) => <li key={tag}><Link href={`${browsePath}?tag=${encodeURIComponent(tag)}`} aria-label={`Find events tagged ${tag}`}>#{tag}</Link></li>)}</ul>;
}
