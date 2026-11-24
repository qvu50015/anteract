import { parseSocialLinks } from "@/lib/social-links";
import { SocialPlatformIcon } from "./social-platform-icon";

export function ProfileSocialLinks({ links }: { links: unknown }) {
  const parsed = parseSocialLinks(links);
  if (!parsed.ok || !parsed.links.length) return null;
  return <section className="profile-socials" aria-labelledby="profile-socials-title"><h2 id="profile-socials-title">Find me on</h2><ul>{parsed.links.map((link) => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${link.platform} profile (opens in a new tab)`}><span className="social-platform-mark" aria-hidden="true"><SocialPlatformIcon platform={link.platform} /></span><span><strong>{link.platform}</strong><small>{new URL(link.url).hostname}</small></span><span className="social-external" aria-hidden="true">↗</span></a></li>)}</ul></section>;
}
