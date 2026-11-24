import Link from "next/link";

export default function NotFound() {
  return <div className="empty-state not-found"><span className="empty-symbol" aria-hidden="true">⌕</span><h1>Nothing here just yet.</h1><p>This event or profile couldn’t be found.</p><Link className="primary" href="/events">Browse events →</Link></div>;
}
