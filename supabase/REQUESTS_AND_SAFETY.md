# Message requests and profile safety

Apply `migrations/20261103054033_message_requests_and_profile_safety.sql` after the direct-messaging migration. For Dashboard-managed deployments, run the file once inside `begin; … commit;` in the configured project's SQL editor. For CLI-managed projects, inspect `supabase db push --help`, review a dry run against the intended project, then apply only missing migrations. This project's existing Dashboard migrations must be reconciled before switching to CLI migration history. The migration requests a PostgREST schema reload and retains all conversation IDs, messages, and participants.

## Behavior

- Existing conversations remain accepted. A new conversation between accepted friends enters Messages immediately.
- Other verified UCI students can send one introductory message. The recipient sees it under Requests, with Accept and Decline. Outgoing requests appear in the sender's Messages folder; Requests is recipient-only. Empty unsent conversations are not shown as incoming requests.
- Only the recipient can decide a pending request. Acceptance moves it into the main inbox for both users and enables replies. Declining prevents more messages and reopening the same pair does not create another request.
- Request acceptance is independent of friendship. Students can chat after accepting a message request without accepting a friend request.
- Send message, Add friend, Block/Unblock, and Report are available on other students' public profiles. Block/Report are also available in chat headers. There are no actions to message, block, or report yourself.
- A block prevents messages, new conversations, and new friend invitations in both directions. Blocking retains existing history. Blocked threads are hidden from the sidebar; visit the profile to unblock. One user cannot remove the other's block. Declined requests remain declined after unblocking.
- Reports are private persisted records, not a fake local action. Reports do not automatically block the target and immediate administrator review is not guaranteed. No notification or moderation queue UI is implemented in this stage.

## Schema and access

`conversations` gains `initiated_by` (profile FK, indexed) and `status` (pending/accepted/declined). A private insertion trigger binds the initiator to auth.uid() and checks existing accepted friendship to determine initial consent. Only status may be updated by clients, and RLS limits that operation to the pending request's recipient. A private message trigger serializes introductory sends using the conversation row lock, checks current consent, enforces one introductory message, and checks bilateral blocks. Existing sender, membership, content-length, and participant-only read rules remain enforced.

`profile_blocks` has a composite blocker/blocked key, profile foreign keys with deletion cascades, a non-self constraint, and a reverse lookup index. Users may read and remove only their own blocks and insert only as themselves. A private caller-scoped function checks bilateral blocking without exposing someone else's block list. A public security-invoker status RPC returns only whether the caller blocked the target and whether this pair can message.

`profile_reports` stores UUID ID, authenticated reporter ID, target profile ID, allowed reason, up to 2000 characters of details, and server timestamp. Self-reporting and impersonation are rejected. Users may insert and read their own report receipts; they cannot edit/delete reports or inspect reports by other users. Project administrators can review reports through their privileged Supabase Dashboard session. No admin key is added to the client.

The main conversation-list RPC now returns status, initiator, and blocked state. Realtime listens for conversation updates as well as inserts so accepting a request refreshes the inbox without reload. Profile safety changes reconcile the open chat immediately in the same browser, with the existing focus/online/30-second synchronization for other sessions. The database rejects blocked sends regardless of client refresh timing.

## Administrator review

Only authorized project administrators should run this in the SQL editor:

```sql
select id, reporter_id, reported_id, reason, details, created_at
from public.profile_reports order by created_at desc;
```

Do not expose this query through a public API or grant all authenticated users access to other people's reports. Set up an operational review process before inviting students to rely on reporting.

## Validation

Run the existing typecheck/build and test suite with the optional isolated Postgres runtime:

```sh
npm run typecheck
DM_PGLITE_MODULE=/tmp/anteract-dm-db-test/node_modules/@electric-sql/pglite/dist/index.js \
  node --experimental-strip-types --test tests/*.test.mjs
npm run build
```

The request/RLS tests apply the real migrations to isolated Postgres roles and validate preserved history, introductions, recipient-only acceptance, declines, bilateral blocking/unblocking, blocked friend invitations, report privacy, and forged metadata. Existing Stage 2 tests still validate the base migration independently. Live staging checks need separate confirmed accounts: request from nonfriend A to B, accept as B, verify real-time inbox movement and replies, repeat with decline, block/unblock each direction, and submit a report using disposable staging users. Do not submit dummy reports against real students for testing.
