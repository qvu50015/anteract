import Link from "next/link";
import { GettingStarted } from "@/components/getting-started";
import { HelpTopics } from "@/components/help-topics";
import { campusPhotos } from "@/lib/campus-photos";
import { EVENT_POINTS } from "@/lib/my-events";

export default function Help() {
  return (
    <div className="help-page">
      <header className="page-heading help-heading">
        <h1>Help &amp; tips</h1>
      </header>
      <GettingStarted alwaysOpen />
      <section className="help-topics" aria-labelledby="help-topics-title">
        <h2 id="help-topics-title">Using Anteract</h2>
        <HelpTopics>
          <details id="discover">
            <summary>Find an event</summary>
            <div className="help-answer">
              <p>Search upcoming events by title, location, or interest. Filter by category, date, or open spots. If you select multiple interest tags, an event must match all of them.</p>
              <Link className="text-link" href="/events">Browse events <span aria-hidden="true">→</span></Link>
            </div>
          </details>
          <details id="events">
            <summary>Join or leave an event</summary>
            <div className="help-answer">
              <p>Select Join event to save a spot. You’ll find it in My Events, where you can add it to Google Calendar. New joins close when an event fills up or starts.</p>
              <p>To give up your spot, open the event and select Leave event. Organizers can cancel a plan for everyone from Manage event.</p>
              <Link className="text-link" href="/my-events">My Events <span aria-hidden="true">→</span></Link>
            </div>
          </details>
          <details id="locations">
            <summary>Find the meeting place</summary>
            <div className="help-answer">
              <p>Use Show campus map to preview the location or Open UCI map to see the full map. Check the organizer’s meeting instructions for the exact entrance or gathering spot.</p>
            </div>
          </details>
          <details id="messages">
            <summary>Send a private message</summary>
            <div className="help-answer">
              <p>Open a student’s profile and select Send message. Friends can message each other directly. For someone new, send an introduction and wait for them to accept. Incoming introductions appear under Requests.</p>
              <p>Profiles and chats include Report and Block. Blocking stops messages in both directions. You can still see existing messages.</p>
              <Link className="text-link" href="/friends#find-students">Find students <span aria-hidden="true">→</span></Link>
            </div>
          </details>
          <details id="hosting">
            <summary>Host an event</summary>
            <div className="help-answer">
              <p>Save your profile, then add a title, category, description, campus location, future start time, and group size. The organizer counts toward the group size.</p>
              <p>Pick a location suggestion, check the map, and add a specific meeting point. Review the preview before publishing. Hosted events appear under Hosting in My Events.</p>
              <p>You can publish up to three events per UTC day. Canceled events count toward that limit.</p>
              <Link className="text-link" href="/events/new">Create an event <span aria-hidden="true">→</span></Link>
            </div>
          </details>
          <details id="points">
            <summary>How event points work</summary>
            <div className="help-answer">
              <p>Each event you join or host earns {EVENT_POINTS} points after its start time. Each plan counts once. Leaving or canceling a plan can change your total.</p>
              <p>Reward tiers are Bronze at 100 points, Silver at 200, and Gold at 350.</p>
              <Link className="text-link" href="/my-events">See your points <span aria-hidden="true">→</span></Link>
            </div>
          </details>
          <details id="campus-photos">
            <summary>Campus photo credits</summary>
            <div className="help-answer campus-photo-credits">
              <ul>
                {campusPhotos.map(photo => (
                  <li key={photo.image}>
                    <a href={photo.source}>{photo.name}</a> by {photo.author}
                    {"licenseUrl" in photo ? <> · <a href={photo.licenseUrl}>{photo.license}</a></> : "license" in photo && <> · {photo.license}</>}
                  </li>
                ))}
              </ul>
              <p>Wikimedia Commons photos were resized and are cropped to fit the carousel.</p>
            </div>
          </details>
        </HelpTopics>
      </section>
    </div>
  );
}
