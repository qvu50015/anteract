import type { ReactNode } from "react";
import { ProfileAvatar } from "./profile-avatar";
import { parseSocialLinks, type SocialLink } from "@/lib/social-links";
import { SocialPlatformIcon } from "./social-platform-icon";

export function ProfileCard({ name, major, year, bio, interests, photoUrl, socialLinks, publicView = false, actions }: { name: string; major: string; year: string; bio: string; interests: string[]; photoUrl: string; socialLinks: SocialLink[]; publicView?: boolean; actions?: ReactNode }) {
  const NameHeading = publicView ? "h1" : "h3";
  const SectionHeading = publicView ? "h2" : "h4";
  const validLinks = socialLinks.flatMap(link => {
    const parsed = parseSocialLinks([link]);
    return parsed.ok ? parsed.links : [];
  });
  return <article className="editor-preview-card" aria-label={publicView ? `${name}’s profile` : "Public profile preview"}>
    <div className="editor-preview-cover"><img src="/UC-Irvine.jpeg" alt="UC Irvine" width="447" height="447" /></div>
    <div className="editor-preview-body">
      <div className="editor-preview-avatar"><ProfileAvatar name={name} photoUrl={photoUrl} /></div>
      <NameHeading className="shared-profile-name">{name.trim() || "Your name"}</NameHeading>
      <p className="editor-preview-meta">{[major.trim(), year].filter(Boolean).join(" · ") || "Your major & class year"}</p>
      {actions && <div className="shared-profile-actions">{actions}</div>}
      {bio.trim() && <div className="editor-preview-section"><SectionHeading>A little about me</SectionHeading><p>{bio.trim()}</p></div>}
      <div className="editor-preview-section"><SectionHeading>Interests</SectionHeading><div className="editor-preview-interests">{interests.length ? interests.map(interest => <span key={interest}>{interest}</span>) : <p className="preview-placeholder">No interests added yet.</p>}</div></div>
      {!!validLinks.length && <div className="editor-preview-socials">{validLinks.map((link, index) => <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${link.platform} (opens in a new tab)`}><SocialPlatformIcon platform={link.platform} /><span>{link.platform}</span></a>)}</div>}
    </div>
  </article>;
}
