"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUciEmail } from "@/lib/supabase/access";
import { profilePhotoBucket } from "@/lib/profile";
import { historyPageSize, compareMessages, compareTimestamps, mergeMessages, messagingError, sortConversations, validMessage, canSendDirectMessage, type DirectConversation, type DirectMessage } from "@/lib/messaging";

type Client = ReturnType<typeof createClient>;
const columns = "id,conversation_id,sender_id,content,created_at";

export function useDirectMessages(recipientId?: string) {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [active, setActive] = useState<DirectConversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("Connecting…");
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [responding, setResponding] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const currentMessages = useRef<DirectMessage[]>([]);
  const client = useRef<Client | null>(null);
  const generation = useRef(0);
  const pending = useRef<{ id: string; content: string; conversation: string } | null>(null);
  const sendingLock = useRef(false);
  const olderLock = useRef(false);
  const readAcknowledged = useRef<DirectMessage | null>(null);
  const readPending = useRef(new Set<string>());

  function merge(rows: DirectMessage[]) {
    currentMessages.current = mergeMessages(currentMessages.current, rows);
    setMessages(currentMessages.current);
  }

  useEffect(() => {
    const run = ++generation.current;
    let alive = true;
    let listVersion = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let cleanup = () => {};
    let uid = "";
    let conversationId = "";
    let catchingUp = false;
    let syncCursor: DirectMessage | undefined;
    setLoading(true); setError(""); setActive(null); setConversations([]); setMessages([]);
    setUserId(""); setSendError(""); setHasOlder(false); setLoadingOlder(false); setSending(false); setResponding(false);
    currentMessages.current = []; pending.current = null;
    sendingLock.current = false; olderLock.current = false;
    readAcknowledged.current = null; readPending.current.clear();
    const valid = () => alive && generation.current === run;

    async function initialize() {
      const db = createClient(); client.current = db;
      const { data: { user }, error: authError } = await db.auth.getUser();
      if (authError) throw authError;
      if (!user?.email_confirmed_at || !isUciEmail(user.email)) throw new Error("Please sign in with your verified UCI account to use Messages.");
      if (!valid()) return;
      uid = user.id; setUserId(uid);

      const auth = db.auth.onAuthStateChange((_event, session) => {
        if (valid() && (!session || session.user.id !== uid)) {
          setConversations([]); setMessages([]); currentMessages.current = []; setActive(null); setUserId("");
          setError("Your session changed. Please sign in again."); setLoading(false); setConnection("Offline");
          alive = false; ++generation.current; client.current = null;
          cleanup();
        }
      });
      cleanup = () => { auth.data.subscription.unsubscribe(); };
      async function loadList() {
        const version = ++listVersion;
        const all: DirectConversation[] = [];
        for (let offset = 0; valid(); offset += 100) {
          const { data, error: listError } = await db.rpc("list_direct_conversations").select("*")
            .order("last_created_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).order("id").range(offset, offset + 99);
          if (listError) throw listError;
          if (data?.some((item: DirectConversation) => !item.status || !item.initiated_by || item.unread_count === undefined)) throw new Error("Messaging setup is incomplete. Apply the latest messaging migration, including unread counts.");
          all.push(...(data ?? []) as DirectConversation[]);
          if (!data || data.length < 100) break;
        }
        const withPhotos = await Promise.all(all.map(async item => {
          if (!item.avatar_path) return item;
          const { data } = await db.storage.from(profilePhotoBucket).createSignedUrl(item.avatar_path, 3600);
          return { ...item, photoUrl: data?.signedUrl };
        }));
        if (!valid() || version !== listVersion) return;
        setConversations(withPhotos);
        if (recipientId) setActive(withPhotos.find(item => item.recipient_id === recipientId) ?? null);
      }
      function scheduleList() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { void loadList().catch(e => { if (valid()) setError(messagingError(e)); }); }, 150);
      }
      async function catchUp() {
        if (!valid() || catchingUp || !conversationId) return;
        catchingUp = true;
        try {
          let latest = syncCursor;
          if (!latest) {
            const { data, error: historyError } = await db.rpc("direct_message_history", { thread_id: conversationId });
            if (historyError) throw historyError;
            if (!valid()) return;
            merge((data ?? []) as DirectMessage[]);
            setHasOlder((data?.length ?? 0) === historyPageSize);
            latest = ((data ?? []) as DirectMessage[]).sort(compareMessages).at(-1);
            syncCursor = latest;
          }
          if (latest) {
            while (valid()) {
              const { data, error: catchError } = await db.rpc("direct_messages_since", { thread_id: conversationId, after_time: latest.created_at, after_id: latest.id });
              if (catchError) throw catchError;
              if (!valid()) return;
              const rows = (data ?? []) as DirectMessage[];
              merge(rows);
              if (rows.length) { latest = rows[rows.length - 1]; syncCursor = latest; }
              if (rows.length < historyPageSize) break;
            }
          }
        } finally { catchingUp = false; }
      }
      async function sync() {
        try { await Promise.all([loadList(), catchUp()]); if (valid()) setError(""); }
        catch (e) { if (valid()) setError(messagingError(e)); }
      }
      if (recipientId) {
        const { data, error: startError } = await db.rpc("start_direct_conversation", { recipient: recipientId });
        if (startError) throw startError;
        if (!valid()) return;
        conversationId = data as string;
        await catchUp();
      }
      await loadList();
      if (!valid()) return;
      setLoading(false);
      const subscribed = new Set<string>();
      function channelStatus(name: string, status: string) {
        if (!valid()) return;
        if (status === "SUBSCRIBED") {
          subscribed.add(name);
          setConnection(subscribed.size === (conversationId ? 2 : 1) ? "Connected" : "Connecting…");
          void sync();
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          subscribed.delete(name); setConnection("Reconnecting… Messages will sync automatically.");
        }
      }
      const overview = db.channel(`dm-list:${uid}:${run}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => { if (valid()) scheduleList(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => { if (valid()) scheduleList(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `user_id=eq.${uid}` }, () => { if (valid()) scheduleList(); })
        .subscribe(status => channelStatus("overview", status));
      const activeChannel = conversationId ? db.channel(`dm-thread:${conversationId}:${run}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, payload => {
          if (valid()) merge([payload.new as DirectMessage]);
        }).subscribe(status => channelStatus("active", status)) : null;
      const onFocus = () => { if (!document.hidden && valid()) void sync(); };
      window.addEventListener("focus", onFocus);
      window.addEventListener("online", onFocus);
      window.addEventListener("profile-safety-changed", onFocus);
      window.addEventListener("direct-message-read", scheduleList);
      interval = setInterval(onFocus, 30_000);
      cleanup = () => {
        clearTimeout(refreshTimer); clearInterval(interval);
        window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus);
        window.removeEventListener("profile-safety-changed", onFocus);
        window.removeEventListener("direct-message-read", scheduleList);
        auth.data.subscription.unsubscribe();
        void db.removeChannel(overview); if (activeChannel) void db.removeChannel(activeChannel);
      };
    }
    void initialize().catch(e => { if (valid()) { setError(messagingError(e)); setLoading(false); setConnection("Offline"); } });
    return () => { alive = false; ++generation.current; client.current = null; cleanup(); };
  }, [recipientId, attempt]);

  async function loadOlder() {
    const oldest = currentMessages.current[0];
    if (!active || !oldest || !client.current || olderLock.current) return;
    olderLock.current = true; setLoadingOlder(true);
    const run = generation.current;
    try {
      const { data, error: historyError } = await client.current.rpc("direct_message_history", { thread_id: active.id, before_time: oldest.created_at, before_id: oldest.id });
      if (historyError) throw historyError;
      if (generation.current !== run) return;
      merge((data ?? []) as DirectMessage[]); setHasOlder(data?.length === historyPageSize); setError("");
    } catch (e) { if (generation.current === run) setError(messagingError(e)); }
    finally { if (generation.current === run) { olderLock.current = false; setLoadingOlder(false); } }
  }
  async function send(content: string) {
    const text = content.trim();
    if (!active || !userId || !client.current || sendingLock.current || !validMessage(text) || !canSendDirectMessage(active, userId, currentMessages.current.length)) return false;
    sendingLock.current = true; setSending(true); setSendError("");
    const run = generation.current;
    if (!pending.current || pending.current.content !== text || pending.current.conversation !== active.id) pending.current = { id: crypto.randomUUID(), content: text, conversation: active.id };
    const id = pending.current.id;
    try {
      const { data, error: insertError } = await client.current.from("messages").insert({ id, conversation_id: active.id, sender_id: userId, content: text }).select(columns).single();
      let saved = data as DirectMessage | null;
      if (insertError?.code === "23505") {
        const retry = await client.current.from("messages").select(columns).eq("id", id).eq("conversation_id", active.id).eq("sender_id", userId).single();
        if (retry.error) throw retry.error;
        saved = retry.data as DirectMessage;
      } else if (insertError) throw insertError;
      if (!saved) throw new Error("Message could not be confirmed. Please retry.");
      if (generation.current !== run) return false;
      merge([saved]); pending.current = null;
      setConversations(current => sortConversations(current.map(item => item.id === saved!.conversation_id && (!item.last_created_at || compareTimestamps(saved!.created_at, item.last_created_at) >= 0) ? { ...item, last_content: saved!.content, last_sender_id: saved!.sender_id, last_created_at: saved!.created_at } : item)));
      return true;
    } catch (e) { if (generation.current === run) setSendError(messagingError(e)); return false; }
    finally { if (generation.current === run) { sendingLock.current = false; setSending(false); } }
  }
  async function markRead(messageId: string) {
    const marker = currentMessages.current.find(item => item.id === messageId);
    if (!active || !client.current || !marker || active.messaging_blocked || readPending.current.has(messageId)
      || (readAcknowledged.current && compareMessages(marker, readAcknowledged.current) <= 0)) return;
    const run = generation.current;
    readPending.current.add(messageId);
    try {
      const { error } = await client.current.rpc("mark_direct_conversation_read", { thread_id: active.id, message_id: messageId });
      if (error) throw error;
      if (generation.current !== run) return;
      if (!readAcknowledged.current || compareMessages(marker, readAcknowledged.current) > 0) readAcknowledged.current = marker;
      const acknowledged = readAcknowledged.current;
      const unread_count = currentMessages.current.filter(item => item.sender_id !== userId && compareMessages(item, acknowledged) > 0).length;
      setConversations(current => current.map(item => item.id === active.id ? { ...item, unread_count } : item));
      setActive(current => current?.id === active.id ? { ...current, unread_count } : current);
      window.dispatchEvent(new Event("direct-message-read"));
    } catch (e) { if (generation.current === run) setError(`Could not mark messages as read. ${messagingError(e)}`); }
    finally { if (generation.current === run) readPending.current.delete(messageId); }
  }
  async function respond(accept: boolean) {
    if (!active || !client.current || responding) return;
    const run = generation.current;
    setResponding(true); setError("");
    try {
      const status = accept ? "accepted" : "declined";
      const { data, error } = await client.current.from("conversations").update({ status }).eq("id", active.id).eq("status", "pending").select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This request has already changed. Refresh and try again.");
      if (run !== generation.current) return;
      setActive(current => current ? { ...current, status } : current);
      setConversations(current => current.map(item => item.id === active.id ? { ...item, status } : item));
    } catch (e) { if (run === generation.current) setError(messagingError(e)); }
    finally { if (run === generation.current) setResponding(false); }
  }
  return { markRead, respond, responding, conversations, active, messages, userId, loading, error, connection, hasOlder, loadingOlder, loadOlder, send, sending, sendError, retry: () => setAttempt(value => value + 1) };
}
