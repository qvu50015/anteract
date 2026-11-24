"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AccountSettings() {
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [appearance, setAppearance] = useState("system");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function sync() {
      let saved = "system";
      try { saved = localStorage.getItem("anteract-appearance") || "system"; } catch {}
      if (!["light", "dark", "system"].includes(saved)) saved = "system";
      setAppearance(saved);
      document.documentElement.dataset.theme = saved === "system" ? (media.matches ? "dark" : "light") : saved;
    }
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!panel.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  function changeAppearance(value: string) {
    setAppearance(value);
    document.documentElement.dataset.theme = value === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : value;
    try { localStorage.setItem("anteract-appearance", value); setStorageNotice(""); }
    catch { setStorageNotice("Appearance will last until you refresh; browser storage is unavailable."); }
  }

  async function logout() {
    setBusy(true); setError("");
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      window.location.assign("/login");
    } catch { setError("Could not log out. Please try again."); setBusy(false); }
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    if (confirmation !== "DELETE" || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete your account. Please try again.");
      try { localStorage.removeItem("anteract-demo-v1"); } catch {}
      await createClient().auth.signOut({ scope: "local" });
      window.location.assign("/login");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete your account. Please try again."); setBusy(false); }
  }

  return <div className="account-settings" ref={panel} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node) && !dialog.current?.open) setOpen(false);
  }}>
    <button ref={trigger} className="account-trigger" aria-label="Account settings" aria-expanded={open} aria-controls="account-settings-panel" onClick={() => setOpen(!open)}>
      <img src="/user_icon.png" alt="" width={32} height={32} style={{ objectFit: "cover", borderRadius: "50%" }} />
    </button>
    {open && <section id="account-settings-panel" className="settings-panel" aria-label="Account settings">
      <div className="settings-heading"><strong>Settings</strong></div>
      <fieldset className="appearance-options"><legend>Appearance</legend><div>{["light", "dark", "system"].map(value => <button type="button" key={value} aria-pressed={appearance === value} onClick={() => changeAppearance(value)}>{value === "light" ? "☀" : value === "dark" ? "☾" : "◐"}<span>{value[0].toUpperCase() + value.slice(1)}</span></button>)}</div></fieldset>
      {storageNotice && <p className="small-note" role="status">{storageNotice}</p>}
      <div className="settings-actions">
        <Link href="/profile" onClick={() => setOpen(false)}>Profile <span aria-hidden="true">↗</span></Link>
        <Link href="/help" onClick={() => setOpen(false)}>Quick start &amp; tips <span aria-hidden="true">↗</span></Link>
          <button disabled={busy} onClick={logout}>{busy ? "Please wait…" : "Log out"}<span aria-hidden="true">↗</span></button>
          <button className="settings-danger" disabled={busy} onClick={() => { setError(""); setConfirmation(""); dialog.current?.showModal(); }}>Delete account <span aria-hidden="true">×</span></button>
      </div>
      {error && !dialog.current?.open && <p className="field-error" role="alert">{error}</p>}
    </section>}
    <dialog ref={dialog} className="safety-dialog delete-account-dialog" aria-labelledby="delete-account-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <form onSubmit={deleteAccount}>
        <h2 id="delete-account-title">Delete your account?</h2>
        <p>This permanently removes your account, profile, photos, friendships, hosted events, and event memberships. This can’t be undone.</p>
        <p>Photo removal happens first. If deletion fails afterward, you may need to upload your photo again.</p>
        <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
        <input id="delete-confirmation" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="safety-actions"><button type="button" className="secondary" disabled={busy} autoFocus onClick={() => dialog.current?.close()}>Keep my account</button><button className="primary delete-confirm" disabled={busy || confirmation !== "DELETE"}>{busy ? "Deleting…" : "Delete account"}</button></div>
      </form>
    </dialog>
  </div>;
}
