# Anteract

A Next.js + React app for discovering UCI hangouts, making plans, and connecting with other students.

## Run locally

Install Node.js LTS (24.x recommended, including npm), then run inside the project folder:

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx --yes pnpm@11.25.0 dev
```

Open http://localhost:3000. Keep the terminal open; Ctrl+C stops the server.
On Windows PowerShell, use `npx.cmd` instead of `npx` if script execution is blocked.

To check the project:

```sh
npx --yes pnpm@11.25.0 typecheck
npx --yes pnpm@11.25.0 build
```

## Screens and flow

| Screen | Route | What to try |
| --- | --- | --- |
| Home | `/` | Follow the optional four-step quick start, or explore freely. |
| Quick start and tips | `/help` | Reopen the guide and read tips for events, locations, messages, hosting, and points. |
| Browse Events | `/events` | Filter/search shared events; create an event or press Join. |
| Create event | `/events/new` | Create a UCI event with a date, capacity, and meeting details. |
| Event details | `/events/<id>` | See event information, join/leave, and cancel an event you host. |
| My Events | `/my-events` | View events you joined and events you host. |
| Friends | `/friends` | Search students, send requests, and accept or decline invitations. |
| My Profile | `/profile` | Edit your profile, photo, interests, and social media links. |
| Student profile | `/profiles/<user-id>` | View a real student profile and message an accepted friend. |
| Messages | `/chat` | View persistent conversations and message accepted friends in real time. |

In backend mode, events and memberships are stored in Supabase and shared across signed-in UCI accounts. Database policies restrict event creation and membership to the authenticated UCI user; unique membership and event capacity are enforced in the database. Cancelling an event removes its memberships. Messaging is stored in Supabase with participant-only access and accepted-friend sending rules.

## Campus maps

Create or edit a real event to use UCI campus location search, preview a pin, or import an official UCI location share link. The standalone demo page has been removed; the shared location picker and maps remain available in event flows.

Event cards, event details, and My Events now link their location text to the official UCI map. Details also embed the map below the meeting instructions. The full-map link stays available if embedding is blocked or slow. No map API key or SDK is needed.

- Science Library opens the library building marker.
- Aldrich Park opens the park landmark; the gathering point remains the entrance near Langson Library.
- UTC opens Watson Bridge, a nearby campus landmark; the gathering point remains the UTC end of the bridge, not an arbitrary restaurant.

`src/components/campus-location-picker.tsx` is the reusable selection field. It returns a `{ label, markerId }` place to the event form. A selected event can store it as optional `campusMapPlace`; existing preset events use `campusLocationId`. Both render through the same map and event-location components. Link validation restricts imports to a single marker on UCI's official map and normalizes the URL. It cannot verify that the supplied name matches a real marker: the person must review the official preview before choosing.

Search and marker URLs are documented by Concept3D: https://help.concept3d.com/hc/en-us/articles/115004127673-Interactive-Map-Query-Strings . Directly fetching search results needs separate API access; this demo does not extract the map's internal key, proxy private APIs, or read cross-origin iframe state. The real search runs within the official iframe; selections outside the quick catalog use the share-link handoff. These are landmark links, not live locations or route calculations.

Official map: https://map.uci.edu/?id=463 . UCI's bridge reference: https://parking.uci.edu/traffic/access-clearance/ .

The real event creation form also offers 93 campus location suggestions: the six pinned landmarks plus building names and abbreviations from the UCI Registrar directory (`https://www.reg.uci.edu/addl/campus/index.old`, retrieved November 2, 2026). The checked-in snapshot is `src/lib/campus-building-directory.js`; it is not a live directory. Searches accept names, abbreviations, and building numbers. These building numbers are not map marker IDs. Only the verified landmarks open exact pins; other suggestions open an official map search. Saved canonical names preserve that behavior after reloading an event. The map demos retain their smaller verified-pin catalog and share-link import.

## Where to edit

- `src/app/page.tsx`: Home.
- `src/app/events/`: Browse Events and event detail routes.
- `src/app/my-events/page.tsx`: joined and hosted plans, event history, and rewards.
- `src/app/profiles/` and `src/app/chat/`: profile and chat routes.
- `src/components/event-card.tsx`: shared event cards and Join button.
- `src/components/event-provider.tsx`: shared event queries and actions.
- `src/components/getting-started-provider.tsx`: account-scoped quick-start milestones and browser preferences.
- `src/components/getting-started.tsx` and `src/app/help/page.tsx`: the first-use guide and reusable help.
- `src/components/use-direct-messages.ts`: persistent conversations and consent rules.
- `src/lib/hangouts.ts`: shared event types and category presentation.
- `src/app/globals.css`: shared blue/gold styling and responsive layouts.

## Backend handoff

Authentication, profiles, event creation, browsing, memberships, messages, blocks, and reports use Supabase after their migrations are applied. Follow `supabase/SETUP.md`, `supabase/MESSAGING.md`, and `supabase/REQUESTS_AND_SAFETY.md` for the current setup and verification steps.

Keep writes in Supabase and preserve database-side authorization, consent, block, and capacity checks. Joining reserves an event membership; there is no separate attendance confirmation or event group chat. Current rewards count joined or hosted events after their start time, without verifying physical attendance.

## Account safety

Profiles and chats offer Report account and Block account controls. Reports require a reason and allow optional details. Reports and blocks persist in Supabase after the safety migration is applied. Blocks prevent messages in both directions and prevent new friend invitations; existing message history remains available. Reports require administrator review through the configured private moderation workflow. See `supabase/REQUESTS_AND_SAFETY.md` for the exact behavior and setup.

## Quick start and help

The home page offers an optional four-step guide: save a name and interest, browse events, join or host a plan, then find it in My Events. Milestones reflect actual saved profile data and event memberships; merely opening My Events before having a plan does not complete the final step. Completed actions remain checked if a student later leaves an event.

Students can hide the guide and reopen it from Home or from **Quick start & tips** in the account menu. `/help` always displays the guide and explains filtering, joining/leaving, meeting locations, private message requests, hosting, and rewards. It requires the same verified UCI login as the other app pages.

Guide progress and visibility are saved per account in this browser. If storage is unavailable, progress lasts for the current page visit; app actions still work. These preferences do not provide authentication or grant access to app data. This update requires no new database migration or environment variables.

## Event discovery

The real `/events` browser supports category, keyword, multiple interest tags (all must match), Today / Next 7 days / Upcoming, and open spots. Browse shows only future starts and sorts by start time. Tags on cards and event details link to a filtered browser. New events accept up to five tags of 24 characters; spaces become hyphens and duplicates are removed. Old events with no tags still work.

Apply `supabase/migrations/202611010001_event_tags.sql` before deploying the updated real creation form. Run `node --test tests/*.test.mjs` for the authentication, map, discovery, messaging, and social-link rules.

## Authentication

All app pages require a verified UCI Supabase account. Configure the variables in `.env.example` and follow `supabase/SETUP.md`. Guest access and browser-local demo data have been removed.

## Profile social media

The profile editor supports up to five optional social media links, with platform selectors, Add and Remove controls. Missing schemes normalize to HTTPS. Links appear on the student's profile and open in a new tab. Empty rows are ignored; duplicate links, non-HTTPS protocols and URLs containing credentials are rejected. Supported labels are Instagram, LinkedIn, Discord, X, TikTok, GitHub and Website.

For Supabase profiles, review and apply `supabase/migrations/202611010002_profile_social_links.sql` before deploying the updated profile form. No remote migration is run by this source package.
