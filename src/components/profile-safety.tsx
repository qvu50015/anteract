"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { messagingError } from "@/lib/messaging";

export const reportReasons = ["Harassment or bullying", "Hate or discrimination", "Threats or violence", "Sexual misconduct", "Spam or scam", "Other"] as const;

export function ProfileSafety({ profileId, name, onChange }: { profileId: string; name: string; onChange?: (blocked: boolean) => void }) {
  const [ownBlock, setOwnBlock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"block" | "report">("block");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const reportId = useRef("");
  const titleId = useId();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await createClient().rpc("profile_safety_status", { target: profileId });
        if (error) throw error;
        if (!data?.length) throw new Error("Please sign in to manage this profile.");
        if (alive) { setOwnBlock(data[0].blocked_by_you); onChange?.(data[0].messaging_blocked); }
      } catch (e) { if (alive) setError(messagingError(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [profileId, onChange]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const db = createClient();
      const { data: { user }, error: authError } = await db.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");
      if (mode === "report") {
        const { error } = await db.from("profile_reports").insert({ id: reportId.current, reporter_id: user.id, reported_id: profileId, reason: fields.get("reason"), details: String(fields.get("details") ?? "").trim() });
        if (error && error.code !== "23505") throw error;
        setNotice("Report submitted privately. Immediate review is not guaranteed.");
      } else {
        const result = ownBlock
          ? await db.from("profile_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", profileId)
          : await db.from("profile_blocks").insert({ blocker_id: user.id, blocked_id: profileId });
        if (result.error && !(result.error.code === "23505" && !ownBlock)) throw result.error;
        const { data, error } = await db.rpc("profile_safety_status", { target: profileId });
        if (error) throw error;
        setOwnBlock(data?.[0]?.blocked_by_you ?? !ownBlock);
        onChange?.(data?.[0]?.messaging_blocked ?? !ownBlock);
        window.dispatchEvent(new Event("profile-safety-changed"));
        setNotice(ownBlock ? "Profile unblocked." : "Profile blocked. Messages and new friend requests are disabled in both directions.");
      }
      dialog.current?.close();
    } catch (e) { setError(messagingError(e)); }
    finally { setBusy(false); }
  }
  function open(next: typeof mode, button: HTMLButtonElement) {
    setMode(next); setError(""); setNotice(""); trigger.current = button;
    if (next === "report") reportId.current = crypto.randomUUID();
    dialog.current?.showModal();
  }
  return <div className="profile-safety">
    <div className="safety-actions"><button className="quiet-button safety-danger" disabled={loading || busy} type="button" onClick={event => open("block", event.currentTarget)}>{ownBlock ? "Unblock" : "Block"}</button><button className="quiet-button" disabled={loading || busy} type="button" onClick={event => open("report", event.currentTarget)}>Report</button></div>
    {notice && <p className="profile-safety-notice" role="status">{notice}</p>}
    {error && !dialog.current?.open && <p className="field-error" role="alert">{error}</p>}
    <dialog className="safety-dialog" ref={dialog} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <form key={`${mode}-${ownBlock}`} onSubmit={event => void submit(event)}>
        <h2 id={titleId}>{mode === "report" ? "Report" : ownBlock ? "Unblock" : "Block"} {name}?</h2>
        {mode === "report" ? <><label>Reason<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option>{reportReasons.map(reason => <option key={reason}>{reason}</option>)}</select></label><label>Details (optional)<textarea name="details" maxLength={2000} rows={4} /></label></> : <p>{ownBlock ? "You can message each other again once both profiles are unblocked. Message request decisions still apply." : "Neither of you can send messages or new friend requests to the other while blocked. Existing conversation history is kept."}</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="safety-actions"><button className="secondary" type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : mode === "report" ? "Submit report" : ownBlock ? "Unblock" : "Block"}</button></div>
      </form>
    </dialog>
  </div>;
}
