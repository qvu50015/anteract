"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useEvents } from "./event-provider";
import { useGettingStarted } from "./getting-started-provider";
import { ProfilePreview } from "./profile-preview";
import { SocialLinksEditor } from "./social-links-editor";
import { parseSocialLinks, type SocialLink } from "@/lib/social-links";
import { createClient } from "@/lib/supabase/client";
import { profileInitials, parseInterests, profilePhotoBucket, profilePhotoMaxBytes, type Profile } from "@/lib/profile";

type Draft = { display_name: string; major: string; class_year: string; bio: string; interests: string[] };
const emptyDraft: Draft = { display_name: "", major: "", class_year: "", bio: "", interests: [] };
const draftFrom = (profile: Profile | null): Draft => ({ display_name: profile?.display_name ?? "", major: profile?.major ?? "", class_year: profile?.class_year ?? "", bio: profile?.bio ?? "", interests: profile?.interests ?? [] });
const snapshot = (draft: Draft, links: SocialLink[]) => JSON.stringify([draft, links]);
const suggestions = ["Coffee", "Study sessions", "Hiking", "Gaming", "Music", "Photography", "ARC workouts", "Beach days"];
const years = ["First year", "Second year", "Third year", "Fourth year", "Graduate student"];

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  return fallback;
}

export default function ProfileEditor() {
  const router = useRouter();
  const { refresh: refreshEvents } = useEvents();
  const { completeProfile, progress: guideProgress } = useGettingStarted();
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState(snapshot(emptyDraft, []));
  const [interestInput, setInterestInput] = useState("");
  const [interestError, setInterestError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localPhotoUrl, setLocalPhotoUrl] = useState("");
  const [userId, setUserId] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error("Please log in to set up your profile.");
        const { data, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        let signedPhoto = "";
        if (data?.avatar_path) {
          const { data: signed, error: photoError } = await supabase.storage.from(profilePhotoBucket).createSignedUrl(data.avatar_path, 3600);
          if (photoError) throw photoError;
          signedPhoto = signed.signedUrl;
        }
        if (active) {
          setUserId(user.id);
          setProfile(data);
          const parsed = parseSocialLinks(data?.social_links);
          setSocialLinks(parsed.ok ? parsed.links : []);
          const next = draftFrom(data);
          setDraft(next); setBaseline(snapshot(next, parsed.ok ? parsed.links : []));
          setPhotoUrl(signedPhoto);
        }
      } catch (loadError) {
        if (active) setError(errorMessage(loadError, "Could not load your profile."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const dirty = !loading && (!!photo || !!interestInput.trim() || snapshot(draft, socialLinks) !== baseline || (!profile && !!userId));
  useEffect(() => {
    if (!photo) { setLocalPhotoUrl(""); return; }
    const url = URL.createObjectURL(photo);
    setLocalPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(patch: Partial<Draft>) { setDraft(current => ({ ...current, ...patch })); setNotice(""); setError(""); }
  function addInterest(value: string) {
    const additions = parseInterests(value);
    const interests = [...draft.interests];
    for (const item of additions) {
      if (item.length > 30) { setInterestError("Keep each interest to 30 characters or fewer."); return; }
      if (!interests.some(existing => existing.toLowerCase() === item.toLowerCase())) interests.push(item);
    }
    if (interests.length > 10) { setInterestError("Choose up to 10 interests. Remove one to add another."); return; }
    edit({ interests }); setInterestInput(""); setInterestError("");
  }
  function discard() {
    const [savedDraft, savedLinks] = JSON.parse(baseline) as [Draft, SocialLink[]];
    setDraft(savedDraft); setSocialLinks(savedLinks); setPhoto(null); setInterestInput(""); setInterestError(""); setError(""); setNotice("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !userId) return;
    const displayName = draft.display_name.trim();
    const major = draft.major.trim();
    const classYear = draft.class_year;
    const bio = draft.bio.trim();
    const interests = [...draft.interests];
    for (const item of parseInterests(interestInput)) {
      if (!interests.some(existing => existing.toLowerCase() === item.toLowerCase())) interests.push(item);
    }
    if (bio.length > 500) { setError("Keep your bio to 500 characters or fewer."); return; }
    if (displayName.length < 2 || displayName.length > 50) { setError("Display name must be between 2 and 50 characters."); return; }
    if (major.length > 100 || interests.length > 10 || interests.some((interest) => interest.length > 30)) {
      setError("Use up to 10 interests, each no longer than 30 characters. Major must be 100 characters or fewer.");
      return;
    }

    const parsedSocials = parseSocialLinks(socialLinks);
    if (!parsedSocials.ok) {
      setError(parsedSocials.error); setNotice("");
      if (parsedSocials.index !== undefined) document.getElementById(`social-url-${parsedSocials.index}`)?.focus();
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    let uploadedPath: string | null = profile?.avatar_path ?? null;
    try {
      const supabase = createClient();
      if (photo) {
        const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        uploadedPath = `${userId}/avatar.${extension}`;
        const { error: uploadError } = await supabase.storage.from(profilePhotoBucket).upload(uploadedPath, photo, { upsert: true, contentType: photo.type });
        if (uploadError) throw uploadError;
      }

      const updated = { id: userId, display_name: displayName, major, class_year: classYear, bio, interests, social_links: parsedSocials.links, avatar_path: uploadedPath };
      const { data, error: saveError } = await supabase.from("profiles").upsert(updated).select("*").single();
      if (saveError) throw saveError;
      completeProfile(data);

      // Profile writes also change event host names and previously visited profile pages.
      router.refresh();
      await refreshEvents();

      let signedPhoto = "";
      if (data.avatar_path) {
        const { data: signed, error: photoError } = await supabase.storage.from(profilePhotoBucket).createSignedUrl(data.avatar_path, 3600);
        if (photoError) throw photoError;
        signedPhoto = signed.signedUrl;
      }
      setProfile(data);
      const savedDraft = draftFrom(data);
      setDraft(savedDraft); setBaseline(snapshot(savedDraft, parsedSocials.links));
      setInterestInput(""); setInterestError("");
      setSocialLinks(parsedSocials.links);
      setPhotoUrl(signedPhoto);
      setPhoto(null);
      setNotice("Your profile is saved.");
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not save your profile. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  function choosePhoto(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > profilePhotoMaxBytes) {
      setError("Profile photos must be 5 MB or smaller.");
      return;
    }
    setPhoto(file);
    setNotice("");
  }

  if (loading) return <section className="page-heading"><p role="status">Loading your profile…</p></section>;
  const previewPhoto = localPhotoUrl || photoUrl;

  return <section className="profile-editor profile-studio" aria-label="Edit your profile">
    <h1 className="sr-only">Edit your profile</h1>
    <div className="profile-studio-toolbar"><button type="button" className="secondary mobile-preview-toggle" aria-expanded={previewOpen} aria-controls="live-profile-preview" onClick={() => setPreviewOpen(!previewOpen)}>{previewOpen ? "Hide preview" : "Preview profile"} <span aria-hidden="true">↗</span></button></div>
    <div className="profile-studio-layout">
      <aside id="live-profile-preview" className={`studio-preview${previewOpen ? " is-preview-open" : ""}`} aria-label="Live preview">
        <div className="preview-heading"><h2>Profile preview</h2></div>
        <ProfilePreview name={draft.display_name} major={draft.major} year={draft.class_year} bio={draft.bio} interests={draft.interests} photoUrl={previewPhoto} socialLinks={socialLinks} />
        {profile && <Link className="text-link" href={`/profiles/${profile.id}`}>View public profile ↗</Link>}
      </aside>
      <form id="profile-edit-form" className="profile-form studio-form" onSubmit={save}>
        <fieldset className="studio-fields" disabled={saving || !userId}>
          <section className="profile-edit-section" aria-labelledby="profile-details-title">
            <div className="edit-section-heading"><span className="edit-section-icon" aria-hidden="true">01</span><div><h2 id="profile-details-title">Profile Details</h2></div></div>
            <div className="studio-photo-row">
              <button type="button" className="avatar-upload" onClick={() => fileInput.current?.click()} aria-label="Change profile photo">
                {previewPhoto ? <img src={previewPhoto} alt="" /> : <span>{profileInitials(draft.display_name) || "A"}</span>}
                <span className="camera-overlay"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h4l2-3h4l2 3h4v15H4z" /><circle cx="12" cy="13" r="4" /></svg></span>
              </button>
              <div><button type="button" className="secondary upload-photo-button" onClick={() => fileInput.current?.click()}>Upload photo</button><p className="small-note" id="photo-help">JPG, PNG or WebP · up to 5 MB</p></div>
              <input ref={fileInput} id="profile-photo" type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Profile photo" aria-describedby="photo-help" onChange={event => { choosePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
            </div>
            <div className="studio-field"><label htmlFor="display-name">Display name</label><input id="display-name" name="display_name" required minLength={2} maxLength={50} value={draft.display_name} onChange={event => edit({ display_name: event.target.value })} placeholder="How should people know you?" autoComplete="nickname" /></div>
            <div className="studio-field-pair">
              <div className="studio-field"><label htmlFor="major">Major</label><input id="major" name="major" maxLength={100} value={draft.major} onChange={event => edit({ major: event.target.value })} placeholder="e.g. Informatics" /></div>
              <div className="studio-field"><label htmlFor="class-year">Class year</label><select id="class-year" name="class_year" value={draft.class_year} onChange={event => edit({ class_year: event.target.value })}><option value="">Select your year</option>{years.map(year => <option key={year}>{year}</option>)}</select></div>
            </div>
          </section>
          <section className="profile-edit-section" aria-labelledby="about-me-title">
            <div className="edit-section-heading"><span className="edit-section-icon" aria-hidden="true">02</span><div><h2 id="about-me-title">About Me</h2></div></div>
            <div className="studio-field"><label className="sr-only" htmlFor="bio">Bio</label><textarea id="bio" name="bio" rows={4} maxLength={500} value={draft.bio} onChange={event => edit({ bio: event.target.value })} placeholder="Bio" aria-describedby="bio-count" /><span id="bio-count" className="field-counter">{draft.bio.length}/500</span></div>
          </section>
          <section className="profile-edit-section" aria-labelledby="interests-title">
            <div className="edit-section-heading"><span className="edit-section-icon" aria-hidden="true">03</span><div><h2 id="interests-title">Interests</h2><p>Find your people through the things you love.</p></div><span className="interest-count">{draft.interests.length}/10</span></div>
            <ul className="editable-interests">{draft.interests.map(interest => <li key={interest}><span>{interest}</span><button type="button" aria-label={`Remove ${interest}`} onClick={() => { edit({ interests: draft.interests.filter(item => item !== interest) }); setInterestError(""); }}>×</button></li>)}</ul>
            <div className="interest-entry studio-field"><label className="sr-only" htmlFor="interest-input">Add an interest</label><input id="interest-input" value={interestInput} maxLength={30} placeholder={draft.interests.length >= 10 ? "All 10 interests added" : "Add your interests"} disabled={draft.interests.length >= 10} aria-describedby="interest-help" aria-invalid={!!interestError} onChange={event => { setInterestInput(event.target.value); setInterestError(""); }} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addInterest(interestInput); } }} /><button type="button" className="secondary" disabled={!interestInput.trim() || draft.interests.length >= 10} onClick={() => addInterest(interestInput)}>Add</button></div>
            <p id="interest-help" className="small-note">Up to 10 interests · 30 characters each · press Enter to add</p>
            {interestError && <p className="field-error" role="alert">{interestError}</p>}
            <div className="interest-suggestions" aria-label="Suggested interests">{suggestions.filter(item => !draft.interests.some(interest => interest.toLowerCase() === item.toLowerCase())).map(item => <button key={item} type="button" disabled={draft.interests.length >= 10} onClick={() => addInterest(item)}>+ {item}</button>)}</div>
          </section>
          <section className="profile-edit-section" aria-label="Social Links"><SocialLinksEditor value={socialLinks} onChange={links => { setSocialLinks(links); setError(""); setNotice(""); }} disabled={saving} /></section>
        </fieldset>
        <div className="profile-feedback">{error && <p className="entry-notice" role="alert">{error}</p>}{notice && <p className="entry-notice" role="status">{notice}</p>}{notice && !guideProgress.join && <Link className="text-link profile-next-plan" href="/events">Find your first plan ↗</Link>}</div>
      </form>

    </div>
    {dirty && <div className="profile-save-bar"><div><strong>Unsaved changes</strong><span>Ready to share the latest you?</span></div><div className="profile-save-actions"><button className="quiet-button" type="button" disabled={saving} onClick={discard}>Discard</button><button className="primary" form="profile-edit-form" type="submit" disabled={saving || !userId}>{saving ? "Saving…" : "Save changes"}<span aria-hidden="true">↗</span></button></div></div>}
  </section>;
}
