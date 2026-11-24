"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUciEmail } from "@/lib/supabase/access";

const UnreadContext = createContext({ messages: 0, requests: 0 });

export function UnreadMessagesProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState({ messages: 0, requests: 0 });
  useEffect(() => {
    let alive = true;
    let epoch = 0;
    let queryVersion = 0;
    let uid = "";
    let authVersion = 0;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleanup = () => {};
    try {
      const db = createClient();
      async function refresh() {
        const run = epoch;
        const version = ++queryVersion;
        if (!uid || !alive) return;
        try {
          const { data, error } = await db.rpc("direct_unread_counts");
          if (!error && alive && run === epoch && version === queryVersion) {
            setCounts({ messages: Number(data?.[0]?.inbox_count ?? 0), requests: Number(data?.[0]?.request_count ?? 0) });
          }
        } catch { /* Keep the last count during a temporary disconnect. */ }
      }
      function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => { void refresh(); }, 120);
      }
      function configure(user: { id: string; email?: string; email_confirmed_at?: string } | null) {
        if (!alive) return;
        const next = user?.email_confirmed_at && isUciEmail(user.email) ? user.id : "";
        if (uid === next) { void refresh(); return; }
        ++epoch; uid = next; setCounts({ messages: 0, requests: 0 });
        if (channel) { void db.removeChannel(channel); channel = null; }
        if (!uid) return;
        channel = db.channel(`unread:${uid}:${crypto.randomUUID()}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, schedule)
          .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, schedule)
          .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `user_id=eq.${uid}` }, schedule)
          .subscribe(status => { if (status === "SUBSCRIBED") void refresh(); });
        void refresh();
      }
      const auth = db.auth.onAuthStateChange((_event, session) => {
        // Do not await Supabase requests within the Auth callback lock.
        ++authVersion;
        queueMicrotask(() => configure(session?.user ?? null));
      });
      const startAuthVersion = authVersion;
      void db.auth.getUser().then(({ data: { user } }) => { if (alive && authVersion === startAuthVersion) configure(user); }).catch(() => {});
      const onFocus = () => { if (!document.hidden) schedule(); };
      window.addEventListener("focus", onFocus);
      window.addEventListener("online", onFocus);
      window.addEventListener("direct-message-read", schedule);
      window.addEventListener("profile-safety-changed", schedule);
      document.addEventListener("visibilitychange", onFocus);
      const interval = setInterval(onFocus, 30_000);
      cleanup = () => {
        clearTimeout(timer); clearInterval(interval); auth.data.subscription.unsubscribe();
        window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus);
        window.removeEventListener("direct-message-read", schedule); window.removeEventListener("profile-safety-changed", schedule);
        document.removeEventListener("visibilitychange", onFocus);
        if (channel) void db.removeChannel(channel);
      };
    } catch { /* Missing configuration is handled by the authentication pages. */ }
    return () => { alive = false; ++epoch; cleanup(); };
  }, []);
  return <UnreadContext.Provider value={counts}>{children}</UnreadContext.Provider>;
}

export function useUnreadMessages() { return useContext(UnreadContext); }
