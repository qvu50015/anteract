"use client";

import Link from "next/link";
import { useState } from "react";
import { FriendRequestButton } from "./friend-request-button";
import { ProfileSafety } from "./profile-safety";

export function ProfileActions({ profileId, name }: { profileId: string; name: string }) {
  const [blocked, setBlocked] = useState<boolean | null>(null);
  return <div className="public-profile-actions">
    {blocked === false && <div className="profile-connect-actions"><Link className="primary" href={`/chat/${profileId}`}>Send message</Link><FriendRequestButton profileId={profileId} name={name} /></div>}
    {blocked === true && <p className="small-note">Messaging is unavailable for this profile.</p>}
    <ProfileSafety profileId={profileId} name={name} onChange={setBlocked} />
  </div>;
}
