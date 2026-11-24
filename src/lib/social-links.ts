export const socialPlatforms = ["Instagram", "LinkedIn", "Discord", "X", "TikTok", "GitHub", "Website"] as const;
export type SocialPlatform = typeof socialPlatforms[number];
export type SocialLink = { platform: SocialPlatform; url: string };
export const maxSocialLinks = 5;

export function parseSocialLinks(input: unknown): { ok: true; links: SocialLink[] } | { ok: false; error: string; index?: number } {
  if (input === undefined || input === null) return { ok: true, links: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Add social media as platform and profile-link pairs." };
  const links: SocialLink[] = [];
  for (let index = 0; index < input.length; index++) {
    const item = input[index];
    if (!item || typeof item.url !== "string") return { ok: false, error: "Enter a profile link for each social account.", index };
    const raw = item.url.trim();
    if (!raw) continue;
    if (!socialPlatforms.includes(item.platform)) return { ok: false, error: "Choose a social media platform.", index };
    try {
      if (/[\u0000-\u001f\u007f]/.test(raw)) throw new Error();
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || url.href.length > 500) throw new Error();
      if (links.some((link) => link.url === url.href)) return { ok: false, error: "This profile link is already in your list.", index };
      links.push({ platform: item.platform, url: url.href });
    } catch { return { ok: false, error: "Use an https:// profile link, such as instagram.com/yourname (up to 500 characters).", index }; }
  }
  if (links.length > maxSocialLinks) return { ok: false, error: `Add up to ${maxSocialLinks} social media links.` };
  return { ok: true, links };
}
