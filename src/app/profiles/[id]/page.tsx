import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profilePhotoBucket } from "@/lib/profile";
import { ProfileCard } from "@/components/profile-card";
import { ProfileActions } from "@/components/profile-actions";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    const supabase = await createClient();
    const [{ data: { user }, error: authError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    ]);
    if (authError || profileError) throw authError ?? profileError;
    if (!profile) notFound();
    let photoUrl = "";
    if (profile.avatar_path) {
      const { data, error } = await supabase.storage.from(profilePhotoBucket).createSignedUrl(profile.avatar_path, 3600);
      if (error) throw error;
      photoUrl = data.signedUrl;
    }
    return <div className="profile-page">
      <ProfileCard publicView name={profile.display_name} major={profile.major} year={profile.class_year} bio={profile.bio ?? ""} interests={profile.interests} photoUrl={photoUrl} socialLinks={profile.social_links ?? []} actions={user?.id === profile.id ? <Link className="secondary" href="/profile">Edit profile</Link> : <ProfileActions profileId={profile.id} name={profile.display_name} />} />
    </div>;
  }
  notFound();
}
