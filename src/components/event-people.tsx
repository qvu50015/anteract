"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { profilePhotoBucket } from "@/lib/profile";
import { ProfileAvatar } from "./profile-avatar";

type EventPerson = { id: string; display_name: string; photoUrl: string };

// Fetch only profiles visible under the current student's existing RLS permissions.
export function useEventPeople(hostId: string, attendeeIds: string[]) {
  const idsKey = JSON.stringify([...new Set([hostId, ...attendeeIds])]);
  const [people, setPeople] = useState<EventPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPeople([]);
    async function load() {
      try {
        const supabase = createClient();
        const { data, error: queryError } = await supabase.from("profiles").select("id, display_name, avatar_path").in("id", JSON.parse(idsKey));
        if (queryError) throw queryError;
        const profiles = await Promise.all((data ?? []).map(async (profile) => {
          let photoUrl = "";
          if (profile.avatar_path) {
            const { data: photo } = await supabase.storage.from(profilePhotoBucket).createSignedUrl(profile.avatar_path, 3600);
            photoUrl = photo?.signedUrl ?? "";
          }
          return { id: profile.id, display_name: profile.display_name, photoUrl };
        }));
        if (active) setPeople(profiles);
      } catch {
        if (active) setError("Profiles couldn’t be loaded. The attendance count is still available.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [idsKey, attempt]);
  return { people, loading, error, retry: () => setAttempt(value => value + 1) };
}

export function EventPersonLink({ person, organizer = false, you = false }: { person: EventPerson; organizer?: boolean; you?: boolean }) {
  return <Link className="ed-person" href={`/profiles/${person.id}`}>
    <ProfileAvatar name={person.display_name} photoUrl={person.photoUrl} />
    <span><strong>{person.display_name}{you ? " (you)" : ""}</strong><small>{organizer ? "Organizer" : "Attendee"}</small></span>
    <span className="ed-person-arrow" aria-hidden="true">↗</span>
  </Link>;
}
