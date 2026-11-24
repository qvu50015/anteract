"use client";

import { SocialPlatformIcon } from "./social-platform-icon";
import { maxSocialLinks, socialPlatforms, type SocialLink, type SocialPlatform } from "@/lib/social-links";

export function SocialLinksEditor({ value, onChange, disabled }: { value: SocialLink[]; onChange: (links: SocialLink[]) => void; disabled: boolean }) {
  const update = (index: number, patch: Partial<SocialLink>) => onChange(value.map((link, itemIndex) => itemIndex === index ? { ...link, ...patch } : link));
  return <fieldset className="social-editor" disabled={disabled}>
    <legend>Social Links <span>(optional)</span></legend>
    <p className="small-note" id="social-links-help">Share up to {maxSocialLinks} profile links. These will appear on your public profile.</p>
    <div className="social-editor-rows">{value.map((link, index) => <div className="social-editor-row" key={index}>
      <span className="social-editor-icon"><SocialPlatformIcon platform={link.platform} /></span>
      <div><label className="sr-only" htmlFor={`social-platform-${index}`}>Platform {index + 1}</label><select id={`social-platform-${index}`} value={link.platform} onChange={(event) => update(index, { platform: event.target.value as SocialPlatform })}>{socialPlatforms.map((platform) => <option key={platform}>{platform}</option>)}</select></div>
      <div className="social-link-url"><label className="sr-only" htmlFor={`social-url-${index}`}>Profile link {index + 1}</label><input id={`social-url-${index}`} value={link.url} onChange={(event) => update(index, { url: event.target.value })} type="text" inputMode="url" autoCapitalize="none" autoComplete="url" spellCheck={false} maxLength={500} placeholder="https://instagram.com/yourname" aria-describedby="social-links-help" /></div>
      <button type="button" className="social-link-remove" aria-label={`Remove social link ${index + 1}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>×</button>
    </div>)}</div>
    <button type="button" className="secondary social-add" disabled={disabled || value.length >= maxSocialLinks} onClick={() => onChange([...value, { platform: "Instagram", url: "" }])}>+ Add link</button>
  </fieldset>;
}
