# Stage 2 direct messaging

The Stage 1 interface now uses Supabase Auth, Postgres, and Realtime. No service-role key is used for messaging. Retired local demo data is removed from browser storage; it is never uploaded as real messages. Guest access has been removed. Group chat, receipts, typing, push notifications, and server-side blocking/reporting are outside this stage.

## Inspect the target before deployment

Repository migrations contain profiles and friend_requests but no equivalent messaging objects. Hosted schema/RLS inspection was not available with the configured publishable key. In the target project's SQL editor, run:

```sql
select table_schema, table_name from information_schema.tables
where table_schema not in ('pg_catalog', 'information_schema', 'storage', 'auth')
order by table_schema, table_name;
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public';
```

If the target already has conversation, participant, or message functionality, stop and reconcile it with this migration before applying. The migration deliberately creates objects without dropping or replacing existing tables. Do not mark an existing remote migration as unapplied or rerun older migrations to force it through.

## Apply the migration

1. Use a staging project first. Confirm all existing repository migrations, especially profiles and friend_requests, are applied. Back up the target through your usual Supabase workflow. Enable Email/password and email confirmation; retain the UCI signup hook documented in SETUP.md.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` and hosting settings. Messaging needs no additional client or server secrets.
3. With a Supabase CLI authenticated to the intended project, inspect the help for your installed version. If `supabase/config.toml` does not exist, run `npx supabase init` once (without `--force`); do not replace an existing config. The version used here supports:

   ```sh
   npx supabase db push --help
   npx supabase db push --remote=<staging-project-ref> --dry-run
   npx supabase db push --remote=<staging-project-ref>
   npx supabase db lint --remote=<staging-project-ref>
   npx supabase db advisors --remote=<staging-project-ref> --type all --fail-on error
   ```

   Review the dry run: it must include only migrations the target is actually missing. Use a scoped access token with only the required project/database permissions; do not place it in NEXT_PUBLIC variables. If your team applies migrations through the Dashboard instead, execute `migrations/20261103050528_direct_messaging.sql` once in that project's SQL editor, inside a transaction, and reconcile migration history through your normal workflow. Never paste the entire migration history into a populated database.
4. The migration adds `public.messages` and `public.conversations` to the `supabase_realtime` publication. Confirm in Dashboard > Database > Replication that both are enabled. Keep `private` out of the Data API's exposed schemas. Confirm the Data API exposes `public` and Realtime is enabled for the project.
5. Verify the schema and publication:

   ```sql
   select tablename, rowsecurity from pg_tables
   where schemaname = 'public' and tablename in ('conversations','conversation_participants','messages');
   select schemaname, tablename from pg_publication_tables
   where pubname = 'supabase_realtime' and tablename in ('conversations','messages');
   select proname, prosecdef from pg_proc
   where proname in ('start_direct_conversation','list_direct_conversations','direct_message_history','direct_messages_since');
   ```

   All three tables must have RLS enabled; all four public RPCs must show `prosecdef = false`. Restart the app after environment changes. A missing migration produces an actionable setup error in Messages rather than falling back to local storage.

## Schema and authorization

- `conversations`: UUID ID, ordered `user_low`/`user_high` profile foreign keys, creation timestamp, unique unordered user pair. No client update/delete grant. Both profile foreign keys are indexed (the pair index covers user_low).
- `conversation_participants`: composite primary key `(conversation_id, user_id)` plus a user lookup index. A private, non-callable trigger inserts exactly the conversation's two users. Clients have no membership write privileges, preventing adding a third user or self-joining another conversation.
- `messages`: UUID ID, conversation ID, sender profile ID, text content, server-generated timestamp. Composite participant foreign key; 1–1000 Unicode characters and at least one non-whitespace character. Indexed `(conversation_id, created_at desc, id desc)` history and sender lookup. Clients cannot backdate, edit, delete, or impersonate a sender.
- A private helper checks authoritative `auth.users` for the calling user's confirmed UCI email. It does not trust editable user_metadata. The other private function only populates membership and cannot be invoked directly by clients. Both have fixed empty search paths.
- Conversation SELECT checks the caller against the pair. Participant SELECT checks conversation visibility. Message SELECT checks the caller's participant row. This avoids recursive RLS and protects guessed IDs, RPCs, REST reads, and Realtime events.
- Starting a conversation and sending messages require an accepted friend request from the existing friend_requests table. Existing participants may continue reading history if the friendship later ends; additional sends fail. Existing conversations are reused atomically under a unique pair constraint.
- All public RPCs are security invokers, so RLS remains in force. Anonymous roles have no table/RPC access. Table/column grants prevent callers supplying creation times or modifying membership.
- Profile deletion cascades to its direct conversations, participants, and messages, consistent with the existing account-deletion flow. No existing user data is altered by the migration.

## Client behavior

`/chat` lists only the signed-in user's database conversations. The retired local-demo block/report controls and sample-profile fallbacks have been removed. `/chat/<profile-uuid>` preserves existing recipient-based links, opens/reuses the thread, and retains public-profile navigation. Accepted friends get Message links from Friends and public profiles. Demo sample profiles do not create real conversations.

History uses 50-row `(created_at, id)` keyset pages. Timestamp strings retain Postgres microseconds. Failed sends retain the draft and reuse their UUID when retried, covering an ambiguous network response after a successful insert. Server confirmations and Realtime events merge by message ID; no optimistic duplicate bubbles or fabricated delivery status are shown.

A conversation-list channel listens for authorized conversation/message inserts. An active-thread channel filters by conversation ID. Both are removed on thread changes, unmount, or signout. Realtime subscription success, window focus, returning online, and a 30-second reconciliation interval refetch previews and catch up all missed messages in ascending pages. Disconnection status is visible. Pagination preserves the reading position; new messages only scroll automatically near the bottom.

## Tests

Fast checks (no hosted mutations):

```sh
npm run typecheck
node --experimental-strip-types --test tests/*.test.mjs
npm run build
```

There is no lint script in package.json. The database test is explicitly skipped unless an isolated PGlite runtime is supplied; this avoids adding a production dependency. To execute the real migration and RLS tests locally:

```sh
npm install --prefix /tmp/anteract-dm-db-test --no-package-lock --no-audit --no-fund @electric-sql/pglite
DM_PGLITE_MODULE=/tmp/anteract-dm-db-test/node_modules/@electric-sql/pglite/dist/index.js \
  node --test tests/messaging-rls.test.mjs
```

This uses real Postgres tables, roles, grants, constraints, RLS, RPCs, and the repository migrations in an ephemeral database, with minimal Auth/Storage fixtures. It does not simulate the Supabase Auth HTTP or Realtime services. Hook tests exercise deduplication, retries, reconnect reconciliation, signout, recipient changes, and channel cleanup using isolated client doubles.

### Required live staging verification

Create three disposable, confirmed UCI accounts with profiles: A and B must be accepted friends; C must be unrelated to both. Use addresses you control; do not disable email confirmation or the UCI hook. Inject these environment variables through your shell/secret manager (never commit passwords):

```
DM_TEST_URL
DM_TEST_PUBLISHABLE_KEY
DM_TEST_A_EMAIL
DM_TEST_A_PASSWORD
DM_TEST_B_EMAIL
DM_TEST_B_PASSWORD
DM_TEST_C_EMAIL
DM_TEST_C_PASSWORD
```

Run `node scripts/test-messaging-live.mjs`. It signs in independent authenticated clients, checks concurrent thread creation, two-account Realtime delivery, independent-device persistence, outsider isolation, sender impersonation, membership writes, content limits, history pagination, missed-message catch-up, previews, and channel removal. It intentionally leaves its uniquely tagged messages in the disposable staging conversation; no existing data is deleted. Do not run against real students' accounts.

Then use two separate browser profiles/devices: A opens B from Friends, sends; B sees the message and sidebar preview without refresh. Reply B→A; refresh and sign back in on another device. Open a different friend and verify channel cleanup, read older history while messages arrive, use Load earlier messages, interrupt network and reconnect, and verify no gaps/duplicates. Check mobile back navigation, profile links, failed-send draft retention, and a signed-out redirect to login. Finally run the hosted database lint/advisors above.

Live verification and deployment are still required when no staging credentials/database access are available. Local Postgres/client-double tests are not a claim of live cross-device delivery.

## Validation recorded for this change

Typecheck and production build passed. Automated tests passed with the optional isolated Postgres runtime enabled, covering existing app behavior plus the messaging helpers, lifecycle, and database policies. Desktop/mobile browser checks used an isolated copy with UI-only fixtures to validate bubble direction, pagination scroll preservation, multiline sending, and back navigation; these fixtures are not shipped. Hosted migration application, Supabase lint/advisors, authenticated cross-device persistence, and real WebSocket delivery remain pending the staging procedure above.

## Deployment status — November 2, 2026

Applied `20261103050528_direct_messaging.sql` through the authenticated Supabase SQL Editor to the configured Anteract project (`hrmwxnhzmojoigoanyux`), inside a transaction, then requested a PostgREST schema-cache reload. Before application, hosted inspection found only profiles, friend_requests, events, and event_members in public; no messaging equivalents existed.

Verified all three messaging tables have RLS enabled and conversations/messages are in the supabase_realtime publication. Reloaded the existing authenticated app at `/chat`: the setup error disappeared and the status became Connected. No messages were sent and no existing user records were changed. Two-account delivery tests remain a separate staging validation.

This project had no supabase_migrations tables visible during inspection; the SQL Editor application did not initialize or rewrite CLI migration history. Reconcile the existing Dashboard-applied migrations before a future CLI db push; do not rerun the table-creation migrations.

## Message requests and safety update

The accepted-friends-only sending rule above describes the initial Stage 2 migration. Apply the later `20261103054033_message_requests_and_profile_safety.sql` migration for the current behavior: friends enter the main inbox directly, nonfriends can send one introductory request, and accepted requests allow chatting independently of friendship. Bilateral blocks and private persisted reports are now supported. See [REQUESTS_AND_SAFETY.md](./REQUESTS_AND_SAFETY.md).

## Unread count update

The later `20261103060311_direct_message_unread_counts.sql` migration adds private read tracking and unread badges without exposing read receipts. See [UNREAD_COUNTS.md](./UNREAD_COUNTS.md). Apply it after the requests/profile-safety migration.
