"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Request = { id: string; sender_id: string; recipient_id: string; status: "pending" | "accepted" | "rejected" };

function message(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Could not update this friend request. Please try again.";
}

export function FriendRequestButton({ profileId, name }: { profileId: string; name: string }) {
  const [userId, setUserId] = useState("");
  const [request, setRequest] = useState<Request | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error("Please log in to connect with UCI students.");
    setUserId(user.id);
    const { data, error: queryError } = await supabase.from("friend_requests")
      .select("id, sender_id, recipient_id, status")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${profileId}),and(sender_id.eq.${profileId},recipient_id.eq.${user.id})`)
      .in("status", ["pending", "accepted"])
      .maybeSingle();
    if (queryError) throw queryError;
    setRequest(data);
    setStatusLoaded(true);
  }

  useEffect(() => {
    let active = true;
    void load().catch((loadError: unknown) => { if (active) setError(message(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profileId]);

  async function act(action: "send" | "accept" | "decline") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      if (action === "send") {
        const { error: insertError } = await supabase.from("friend_requests").insert({ sender_id: userId, recipient_id: profileId });
        if (insertError) throw insertError;
      } else {
        if (!request) throw new Error("This friend request is no longer available.");
        const { data, error: updateError } = await supabase.from("friend_requests").update({ status: action === "accept" ? "accepted" : "rejected" }).eq("id", request.id).select("id").maybeSingle();
        if (updateError) throw updateError;
        if (!data) throw new Error("This friend request is no longer pending. Refresh and try again.");
      }
      await load();
      setNotice(action === "send" ? `Friend request sent to ${name}.` : action === "accept" ? `You and ${name} are now friends.` : `Request from ${name} declined.`);
    } catch (actionError) {
      setError(message(actionError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <span className="small-note" role="status">Loading friend status…</span>;
  if (!statusLoaded) return <div className="friend-actions"><span className="friend-error" role="alert">{error || "Could not load friend status."}</span><button className="quiet-button" type="button" onClick={() => {
    setLoading(true);
    setError("");
    void load().catch((loadError: unknown) => setError(message(loadError))).finally(() => setLoading(false));
  }}>Try again</button></div>;
  if (userId === profileId) return null;
  const incoming = request?.status === "pending" && request.recipient_id === userId;
  return <div className="friend-actions">
    {request?.status === "accepted" ? <span className="friend-state">✓ Friends</span>
      : incoming ? <><button className="primary" type="button" disabled={busy} onClick={() => void act("accept")}>Accept request</button><button className="quiet-button" type="button" disabled={busy} onClick={() => void act("decline")}>Decline</button></>
      : request?.status === "pending" ? <span className="friend-request-sent"><span className="friend-request-sent-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 3-7 18-4-7-7-4 18-7Z" /><path d="m10 14 6-6" /></svg></span>Request sent<svg className="friend-request-sent-check" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg></span>
      : <button className="primary" type="button" disabled={busy} onClick={() => void act("send")}>{busy ? "Sending…" : "Add friend"}</button>}
    {error && <span className="friend-error" role="alert">{error}</span>}
    {notice && <span className="small-note" role="status">{notice}</span>}
  </div>;
}
