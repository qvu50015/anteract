"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { isExistingSignup, isUciEmail } from "@/lib/supabase/access";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  useEffect(() => {
    let active = true;
    const status = new URLSearchParams(window.location.search).get("auth");
    if (new URLSearchParams(window.location.search).get("mode") === "reset") setMode("reset");
    if (status === "invalid-link") {
      // One-time links can be consumed successfully before a repeat visit.
      // Check the session before presenting the callback failure as an error.
      setNotice("Checking your email verification…");
      void (async () => {
        try {
          const { data: { user }, error } = await createClient().auth.getUser();
          if (!active) return;
          if (!error && user?.email_confirmed_at && isUciEmail(user.email)) {
            setAlreadyVerified(true);
            setNotice("Success! Your email is verified and you’re logged in.");
          } else {
            setNotice("Your email may already be verified. Try logging in below. If you still can’t log in, request a new confirmation or password reset link.");
          }
        } catch {
          if (active) setNotice("We couldn’t check your verification status. Try logging in below.");
        }
      })();
    }
    if (status === "unavailable") setNotice("Account services are not configured yet. Please try again later.");
    if (status === "password-updated") setNotice("Your password has been updated. Log in with your new password.");
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!isUciEmail(email)) { setNotice("Please use your @uci.edu email address."); return; }
    setBusy(true); setNotice("");
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (isExistingSignup(data.user, error)) {
          setMode("login");
          const passwordInput = formElement.elements.namedItem("password");
          if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
          setNotice("An account with this email already exists. Please log in with your existing password, or choose Forgot password? to reset it.");
          return;
        }
        if (error) throw error;
        setNotice("Check your UCI inbox for a confirmation link. If you already have an account, log in or reset your password.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password` });
        if (error) throw error;
        setNotice("Check your inbox and spam folder. If an account exists, open the reset link in this browser to choose a new password. The new-password form opens after you follow that link.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user.email_confirmed_at || !isUciEmail(data.user.email)) {
          await supabase.auth.signOut();
          throw new Error("Confirm your UCI email before logging in.");
        }
        window.location.assign("/");
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not connect. Please try again."); }
    finally { setBusy(false); }
  }
  function changeMode(next: typeof mode) { setMode(next); setNotice(""); }

  return <div className="welcome-page">
    <section className="welcome-story story-social" aria-labelledby="page-title">
      <Link className="welcome-brand" href="/" aria-label="Anteract home"><span><img src="/anteater.svg" alt="" width="36" height="36" /></span>anteract<span className="brand-period">.</span></Link>
      <div className="social-stage">
        <div className="social-collage" aria-label="UCI friends, Aldrich Park, and campus life">
          <div className="social-coast"><img src="/uci-aldrich-park.jpg" alt="Students walking through Aldrich Park at UCI" /><span aria-hidden="true">⌖</span></div>
          <div className="social-friends"><img src="/uci-campus-students.jpg" alt="UCI students smiling together in blue and gold campus gear" /><div className="social-progress" aria-hidden="true"><i /><i /><i /></div><div className="social-story-caption">Better<br />together.</div><div className="social-reply" aria-hidden="true"><span /><i /><i /></div></div>
          <div className="social-coffee"><span className="social-coffee-icon" aria-hidden="true">🌳</span><img src="/uci-campus.jpg" alt="Students gathering along a tree-lined UCI campus walkway" /><span className="social-card-line" /><span className="social-card-line short" /></div>
          <div className="social-portrait"><img src="/uci-student.jpg" alt="A UCI student smiling while working on her laptop" /></div>
          <span className="social-smile" aria-hidden="true">☀</span>
          <span className="social-heart" aria-hidden="true">♥</span>
          <span className="social-plan">Coffee? <span aria-hidden="true">↗</span></span>
        </div>
        <h1 className="social-headline" id="page-title">Find<br />the<br />people<br /><span>you click<br />with.</span></h1>
      </div>
    </section>
    <section className="welcome-entry" aria-labelledby="entry-title">
      <span className="uci-badge"><img src="/uci_logo.png" alt="UCI anteater mascot" width="76" height="41" /> EXCLUSIVELY UCI</span>
      <div className="entry-content">
        <h2 id="entry-title">{mode === "signup" ? "Your people are here." : mode === "reset" ? "Let’s get you back in." : "Hello, Anteater."}<span> {mode === "login" ? "✳" : ""}</span></h2>
        <p className="entry-description">{mode === "signup" ? "A shared campus is a pretty good place to start." : mode === "reset" ? "Start with your UCI email address." : "Your next connection is just a hello away."}</p>
        <form className="welcome-form" onSubmit={submit}>
          <label htmlFor="uci-email">UCI email address</label>
          <input id="uci-email" name="email" type="email" placeholder="you@uci.edu" autoComplete="email" required title="Use your @uci.edu email address" />
          {mode !== "reset" && <><label htmlFor="password">Password</label><input id="password" name="password" type="password" placeholder={mode === "signup" ? "Create a password" : "Enter your password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required /></>}
          <button className="welcome-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create your account" : mode === "reset" ? "Reset password" : "Log in"}<span aria-hidden="true">↗</span></button>
          {notice && <p className="entry-notice" role="status">{notice}</p>}
          {alreadyVerified && <Link className="welcome-create" href="/">Continue to Anteract ↗</Link>}
        </form>
        <button className="forgot-link" disabled={busy} onClick={() => changeMode(mode === "login" ? "reset" : "login")}>{mode === "login" ? "Forgot password?" : "Back to log in"}</button>
        <div className="entry-divider"><span /> <p>A NEW FACE ON CAMPUS?</p> <span /></div>
        <button className="welcome-create" disabled={busy} onClick={() => changeMode(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "I already have an account" : "Find your people. Join Anteract."}</button>
      </div>
    </section>
  </div>;
}
