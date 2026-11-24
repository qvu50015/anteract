import Link from "next/link";
import { CampusCarousel } from "@/components/campus-carousel";
import { GettingStarted } from "@/components/getting-started";

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="page-title">
        <div className="home-hero-content">
          <h1 id="page-title">Make plans at UCI.</h1>
          <p>Find a study group, grab lunch, or meet someone new on campus.</p>
          <div className="home-hero-actions">
            <Link className="primary" href="/events">Browse events <span aria-hidden="true">→</span></Link>
            <Link className="home-plans-link" href="/my-events">My Events</Link>
          </div>
        </div>
        <CampusCarousel />
      </section>
      <GettingStarted />
    </div>
  );
}
