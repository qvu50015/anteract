import Link from "next/link";
import type { ReactNode } from "react";
import { ProfileAvatar } from "./profile-avatar";
import { sharedInterests, type FriendProfile } from "@/lib/friend-discovery";

export function StudentConnectionCard({ profile, ownInterests, children }: { profile: FriendProfile; ownInterests: string[]; children?: ReactNode }) {
  const shared = sharedInterests(profile.interests, ownInterests);
  return <article className="student-connection-card" aria-label={profile.display_name}>
    <div className="student-card-accent" aria-hidden="true" />
    <Link className="student-card-person" href={`/profiles/${profile.id}`}>
      <ProfileAvatar name={profile.display_name} photoUrl={profile.photoUrl} />
      <h3>{profile.display_name}</h3>
      <p>{profile.major || "UCI student"}{profile.class_year && <><span aria-hidden="true"> · </span>{profile.class_year}</>}</p>
    </Link>
    {!!profile.interests.length && <ul className="student-card-interests" aria-label={`${profile.display_name}’s interests`}>{profile.interests.map(interest => <li key={interest} className={shared.includes(interest) ? "is-shared" : undefined}>{interest}{shared.includes(interest) && <span className="sr-only"> (shared interest)</span>}</li>)}</ul>}
    {shared.length > 0 && <p className="student-card-shared"><span aria-hidden="true">✦</span> {shared.length} {shared.length === 1 ? "interest" : "interests"} in common</p>}
    <div className="student-card-actions">{children}</div>
  </article>;
}
