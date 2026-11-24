"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isUciEmail } from "@/lib/supabase/access";

export default function ResetPassword() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    let active = true;
    async function checkLink() {
      try {
        const { data: { user }, error } = await createClient().auth.getUser();
        if (error || !user?.email_confirmed_at || !isUciEmail(user.email)) {
          throw new Error("This reset link is invalid or expired. Request a new link and open it in the same browser.");
        }
        if (active) setReady(true);
      } catch (error) {
        if (active) {
          setInvalid(true);
          setNotice(error instanceof Error ? error.message : "Could not verify your reset link. Please request a new one.");
        }
      }
    }
    void checkLink();
    return () => { active = false; };
  }, []);
  return <section className="password-reset"><h1>Choose a new password.</h1><p className="body-copy">Use at least 8 characters.</p>
    {done ? <Link className="primary" href="/login?auth=password-updated">Back to log in</Link> : invalid ? <Link className="primary" href="/login?mode=reset">Request a new reset link</Link> : !ready ? <p role="status">Checking your reset link…</p> : <form className="welcome-form" onSubmit={async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (form.get("password") !== form.get("confirm")) { setNotice("Your passwords don’t match."); return; }
      setBusy(true); setNotice("");
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email_confirmed_at || !isUciEmail(user.email)) throw new Error("Open a valid password reset link from your UCI inbox first.");
        const { error } = await supabase.auth.updateUser({ password: String(form.get("password")) });
        if (error) throw error;
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          setDone(true); setNotice("Password updated. Your session could not be signed out; you can continue using your new password.");
          return;
        }
        setDone(true); setNotice("Password updated. You can now log in.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update your password. Please try again."); }
      finally { setBusy(false); }
    }}><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required /><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" name="confirm" type="password" autoComplete="new-password" minLength={8} required /><button className="welcome-submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button></form>}
    <p role="status" className="entry-notice">{notice}</p>
  </section>;
}
