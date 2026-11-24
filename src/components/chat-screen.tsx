"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { profileInitials } from "@/lib/profile";
import { canSendDirectMessage, conversationFolder, unreadTotals, unreadLabel, type DirectConversation, type DirectMessage } from "@/lib/messaging";
import { useDirectMessages } from "./use-direct-messages";
import { ProfileSafety } from "./profile-safety";

function messageTime(value: string, compact = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return compact && date.toDateString() !== new Date().toDateString()
    ? date.toLocaleDateString([], { month: "short", day: "numeric" })
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function Avatar({ person }: { person: DirectConversation }) {
  return <span className="avatar blue" aria-hidden="true">{person.photoUrl ? <img src={person.photoUrl} alt="" /> : profileInitials(person.display_name)}</span>;
}
function MessageBubble({ message, outgoing }: { message: DirectMessage; outgoing: boolean }) {
  return <div className={`message-row ${outgoing ? "outgoing" : "incoming"}`}>
    <div className="message-bubble"><span className="sr-only">{outgoing ? "You: " : "Recipient: "}</span><p>{message.content}</p></div>
    <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>{messageTime(message.created_at)}</time>
  </div>;
}

export function ChatScreen({ recipientId }: { recipientId?: string }) {
  const chat = useDirectMessages(recipientId);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"inbox" | "requests">("inbox");
  useEffect(() => {
    if (chat.active?.status === "pending" && chat.active.initiated_by !== chat.userId) setView("requests");
    else if (chat.active?.status === "accepted" || chat.active?.initiated_by === chat.userId) setView("inbox");
  }, [chat.active?.id, chat.active?.status, chat.active?.initiated_by, chat.userId]);
  const unread = unreadTotals(chat.conversations, chat.userId);
  const matches = chat.conversations.filter(item => conversationFolder(item, chat.userId) === view
    && item.display_name.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className={`messenger chat-layout ${recipientId ? "has-active-chat" : ""}`} aria-label="Messages">
    <aside className="chat-sidebar" aria-label="Conversations">
      <header className="messenger-heading"><h1>Messages<span className="gold-dot">.</span></h1><Link href="/friends#find-students" className="messenger-new" aria-label="Find a student to message" title="Find a student to message">＋</Link></header>
      <label className="conversation-search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><span className="sr-only">Search conversations by name</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search conversations" /></label>
      <div className="message-inbox-tabs" role="group" aria-label="Message folders"><button type="button" aria-pressed={view === "inbox"} onClick={() => setView("inbox")}>Messages{unread.messages > 0 && <span aria-label={`${unread.messages} unread messages`}>{unreadLabel(unread.messages)}</span>}</button><button type="button" aria-pressed={view === "requests"} onClick={() => setView("requests")}>Requests{unread.requests > 0 && <span aria-label={`${unread.requests} unread message requests`}>{unreadLabel(unread.requests)}</span>}</button></div>
      <nav className="conversation-list" aria-label="Message conversations" aria-busy={chat.loading}>
        {chat.loading ? <div className="conversation-placeholder" role="status">Loading conversations…</div> : !matches.length ? <div className="conversation-placeholder"><strong>{query.trim() ? "No conversations found" : view === "requests" ? "No message requests" : "No conversations yet"}</strong></div> : matches.map(contact => <Link className={`conversation ${contact.recipient_id === recipientId ? "active" : ""} ${contact.unread_count > 0 ? "is-unread" : ""}`} key={contact.id} href={`/chat/${contact.recipient_id}`} scroll={false} aria-current={contact.recipient_id === recipientId ? "page" : undefined}>
          <Avatar person={contact} /><span className="conversation-copy"><span className="conversation-topline"><strong>{contact.display_name}</strong>{contact.last_created_at && <time dateTime={contact.last_created_at} title={new Date(contact.last_created_at).toLocaleString()}>{messageTime(contact.last_created_at, true)}</time>}</span><span className="conversation-preview"><small>{contact.status === "pending" ? contact.initiated_by === chat.userId ? "Sent request · " : "Message request · " : ""}{contact.last_content ? `${contact.last_sender_id === chat.userId ? "You: " : ""}${contact.last_content}` : "Start a conversation"}</small>{contact.unread_count > 0 && <span className="conversation-unread-badge" aria-label={`${contact.unread_count} unread ${contact.unread_count === 1 ? "message" : "messages"}`}>{unreadLabel(contact.unread_count)}</span>}</span></span>
        </Link>)}
      </nav>
      <p className="messenger-local-note messenger-connection" role="status">{chat.connection === "Connected" && <span className="messenger-connected-dot" aria-hidden="true" />}{chat.connection}</p>
      {chat.error && !recipientId && <MessagingError error={chat.error} retry={chat.retry} />}
    </aside>
    {recipientId ? chat.active ? <ActiveChat key={chat.active.id} chat={chat} person={chat.active} /> : <div className="chat-panel messenger-welcome"><Link href="/chat" className="text-link">← Back to conversations</Link>{chat.loading ? <p role="status">Loading conversation…</p> : <MessagingError error={chat.error || "Conversation unavailable. Choose a student to message."} retry={chat.retry} />}</div> : <div className="chat-panel messenger-welcome"><span className="messenger-welcome-icon" aria-hidden="true">✦</span><h2>Your next hello starts here</h2><p>Choose a conversation or visit a friend’s profile to start one.</p><Link className="secondary" href="/friends#my-friends">Find your friends</Link><Link className="text-link" href="/help#messages">How message requests work ↗</Link></div>}
  </section>;
}
function MessagingError({ error, retry }: { error: string; retry: () => void }) {
  return <div className="messaging-error"><p role="alert">{error}</p><button className="quiet-button" type="button" onClick={retry}>Try again</button>{error.includes("sign in") && <Link className="text-link" href="/login">Sign in</Link>}</div>;
}
function ActiveChat({ person, chat }: { person: DirectConversation; chat: ReturnType<typeof useDirectMessages> }) {
  const [draft, setDraft] = useState("");
  const [showLatest, setShowLatest] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const followLatest = useRef(true);
  const prependPosition = useRef<{ height: number; top: number; first: string } | null>(null);
  const canSend = canSendDirectMessage(person, chat.userId, chat.messages.length);
  const pendingIncoming = person.status === "pending" && person.initiated_by !== chat.userId;
  const lastMessage = chat.messages.at(-1)?.id;
  const previousLast = useRef(lastMessage);
  const readAction = useRef(chat.markRead);
  readAction.current = chat.markRead;
  function markVisibleRead() {
    const element = thread.current;
    if (lastMessage && element && !person.messaging_blocked && document.visibilityState === "visible" && document.hasFocus()
      && element.scrollHeight - element.scrollTop - element.clientHeight < 64) void readAction.current(lastMessage);
  }
  useEffect(() => {
    const timer = setTimeout(markVisibleRead, 150);
    const retry = setInterval(markVisibleRead, 15_000);
    window.addEventListener("focus", markVisibleRead);
    document.addEventListener("visibilitychange", markVisibleRead);
    return () => {
      clearTimeout(timer); clearInterval(retry);
      window.removeEventListener("focus", markVisibleRead);
      document.removeEventListener("visibilitychange", markVisibleRead);
    };
  }, [lastMessage, person.id, person.messaging_blocked]);
  function scrollToLatest() {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
    followLatest.current = true; setShowLatest(false);
    markVisibleRead();
  }
  useLayoutEffect(() => {
    const element = thread.current;
    if (!element) return;
    const position = prependPosition.current;
    if (position && chat.messages[0]?.id !== position.first) {
      element.scrollTop = position.top + element.scrollHeight - position.height;
      prependPosition.current = null;
    } else if (followLatest.current) scrollToLatest();
    else if (lastMessage !== previousLast.current) setShowLatest(true);
    previousLast.current = lastMessage;
  }, [chat.messages, lastMessage]);
  useLayoutEffect(() => {
    const element = thread.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { if (followLatest.current) element.scrollTop = element.scrollHeight; });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!composer.current) return;
    composer.current.style.height = "auto";
    composer.current.style.height = `${Math.min(composer.current.scrollHeight, 128)}px`;
  }, [draft]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sentDraft = draft;
    if (await chat.send(sentDraft)) {
      setDraft(current => current === sentDraft ? "" : current);
      composer.current?.focus();
    }
  }
  async function older() {
    const element = thread.current;
    if (!element || chat.loadingOlder) return;
    followLatest.current = false;
    prependPosition.current = { height: element.scrollHeight, top: element.scrollTop, first: chat.messages[0]?.id ?? "" };
    await chat.loadOlder();
  }
  return <div className="chat-panel">
    <header className="chat-header"><Link href="/chat" className="chat-mobile-back" aria-label="Back to conversations">←</Link><Link className="host-line large chat-recipient" href={`/profiles/${person.recipient_id}`}><Avatar person={person} /><span><strong>{person.display_name}</strong></span></Link><ProfileSafety profileId={person.recipient_id} name={person.display_name} /></header>
    {person.messaging_blocked ? <p className="message-request-banner">Messaging is unavailable for this profile.</p> : person.status === "pending" ? <div className="message-request-banner"><div><strong>{pendingIncoming ? "Message request" : "Message request sent"}</strong><p>{pendingIncoming ? "Accept to reply and move this conversation to Messages." : chat.messages.length ? "Waiting for this student to accept." : "Send one introductory message."}</p></div>{pendingIncoming && <div className="safety-actions"><button className="primary" type="button" disabled={chat.responding} onClick={() => void chat.respond(true)}>Accept</button><button className="secondary" type="button" disabled={chat.responding} onClick={() => void chat.respond(false)}>Decline</button></div>}</div> : person.status === "declined" ? <p className="message-request-banner">This message request was declined.</p> : null}
    {chat.error && <MessagingError error={chat.error} retry={chat.retry} />}
    <div className="message-thread" ref={thread} tabIndex={0} role="log" aria-label={`Conversation with ${person.display_name}`} aria-live="polite" aria-relevant="additions" onScroll={() => {
      const element = thread.current;
      if (!element) return;
      followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
      if (followLatest.current) { setShowLatest(false); markVisibleRead(); }
    }}>
      {chat.hasOlder && <button className="quiet-button history-more" type="button" disabled={chat.loadingOlder} onClick={() => void older()}>{chat.loadingOlder ? "Loading…" : "Load earlier messages"}</button>}
      {chat.messages.length ? chat.messages.map((message, index) => {
        const previous = chat.messages[index - 1];
        const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
        return <div className="message-entry" key={message.id}>{newDay && <div className="message-day"><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</time></div>}<MessageBubble message={message} outgoing={message.sender_id === chat.userId} /></div>;
      }) : <div className="chat-empty"><Avatar person={person} /><h2>Say hello to {person.display_name.split(" ")[0]}</h2><p>This is the start of your conversation.</p></div>}
    </div>
    {showLatest && <button className="chat-jump" type="button" onClick={scrollToLatest}>Jump to latest <span aria-hidden="true">↓</span></button>}
    <div className="chat-composer"><form className="message-form" onSubmit={event => void send(event)}><label className="sr-only" htmlFor="message">Message {person.display_name}</label><textarea ref={composer} id="message" name="message" rows={1} placeholder={`Message ${person.display_name.split(" ")[0]}…`} maxLength={1000} disabled={!canSend} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
    }} /><button className="primary" type="submit" aria-label="Send message" disabled={!canSend || chat.sending || !draft.trim()}>{chat.sending ? "Sending…" : "Send"}<span aria-hidden="true">↑</span></button></form>
    {chat.sendError && <p className="messaging-send-error" role="alert">{chat.sendError} Your message is kept above; select Send to retry.</p>}</div>
  </div>;
}
