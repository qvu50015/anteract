# Private unread counts

Apply `migrations/20261103060311_direct_message_unread_counts.sql` after the direct messaging and message-request/profile-safety migrations. This migration has not been applied remotely by the agent; database setup remains manual at the user's request.

In the configured Anteract project's Supabase SQL Editor, create a query containing `BEGIN;`, the entire migration file, and `COMMIT;`, then run it once. It replaces the conversation-list function to include unread counts and adds a private-per-user read-position table. Existing users, messages, requests, and conversations are preserved. The function replacement may trigger Supabase's generic destructive-operation warning. Do not rerun older migrations. Refresh the app after success.

## Behavior

- Each conversation row shows its number of unread incoming messages.
- Messages and Requests show separate unread totals. Requests counts unread introductions, not every pending request; a read request remains pending without a badge until accepted or declined.
- The floating navigation shows the combined unread Messages/Requests total, including while browsing other app pages. Badges display 99+ above 99.
- Your own messages, declined conversations, and blocked threads do not contribute to the totals.
- A chat is marked read only when its panel is open, the document is visible and focused, and the thread is near the latest message. Reading older messages or keeping the tab hidden preserves new unread counts. Jump to latest marks visible new messages read.
- Read positions persist in Supabase across refreshes/devices. The user's other sessions receive private read-position updates through Realtime. Counts also reconcile on reconnect, focus, returning online, and periodic refresh.
- Existing incoming history starts unread until the user opens it; previous versions had no durable read history to migrate.
- There are no public read receipts. The sender cannot see the recipient's read position.

## Schema and privacy

`conversation_reads` has a composite user/conversation primary key, profile/conversation/message foreign keys, an exact message ID and Postgres timestamp cursor, and indexes for foreign-key cascades. RLS permits each verified UCI participant to read and advance only their own position. Clients cannot delete a read position, impersonate another reader, supply timestamps, use another conversation's message as a cursor, or move the cursor backwards. The trigger and public RPC run with the caller's privileges; no new security-definer function or administrative client credential is introduced.

`list_direct_conversations()` now returns `unread_count`. `direct_unread_counts()` aggregates the caller's accepted inbox and incoming pending-request counts without the REST API row limit truncating totals. `mark_direct_conversation_read(thread_id, message_id)` derives time from an actual RLS-visible message and advances the caller's cursor monotonically. Exact timestamp/UUID ordering preserves Postgres microseconds and distinguishes messages with the same timestamp.

The migration adds conversation_reads to the existing supabase_realtime publication. Its SELECT policy exposes rows only to their owner; the client additionally filters by the current user ID. The existing message participant RLS continues to protect all counting queries.

## Verification

```sql
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename='conversation_reads';
select schemaname, tablename from pg_publication_tables
where pubname='supabase_realtime' and tablename='conversation_reads';
```

Expect RLS enabled and one publication entry. In two independent authenticated sessions, send A→B: B's badge increments; A's own sends do not count as unread. Open the chat as B and scroll to latest: B's count clears, including on another device signed in as B. Repeat for a nonfriend request; reading clears only the unread badge, accepting moves the chat into Messages. Verify hidden-tab and older-history behavior and that A cannot select B's conversation_reads rows.

Local automated tests execute the real migration with authenticated Postgres role fixtures and verify count separation, privacy, forged markers, exact cursor ordering, monotonic reads, blocked/declined exclusion, and accepted-request movement. Provider/hook tests verify counter synchronization, signout cleanup, duplicate-write avoidance, and subscriptions. Browser checks use an isolated UI fixture with no live messages. Live two-account verification remains a manual deployment check.
