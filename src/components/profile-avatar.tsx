import { profileInitials } from "@/lib/profile";

/** One crop, size, and fallback for the editor preview and public profiles. */
export function ProfileAvatar({ name, photoUrl = "" }: { name: string; photoUrl?: string }) {
  return <span className="shared-profile-avatar">
    {photoUrl ? <img src={photoUrl} alt={`${name.trim() || "Student"}'s profile photo`} /> : <span>{profileInitials(name) || "A"}</span>}
  </span>;
}
