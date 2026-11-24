import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isUciEmail } from "@/lib/supabase/access";
import { profilePhotoBucket } from "@/lib/profile";

export async function DELETE(request: Request) {
  // Cookie-authenticated mutations must originate from this application.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return NextResponse.json({ error: "Account deletion is not configured yet. Please contact support." }, { status: 503 });

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email_confirmed_at || !isUciEmail(user.email)) {
    return NextResponse.json({ error: "Please log in again before deleting your account." }, { status: 401 });
  }
  const admin = createAdminClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  // Remove every uploaded version, not only the currently selected avatar.
  const bucket = admin.storage.from(profilePhotoBucket);
  while (true) {
    const { data: photos, error } = await bucket.list(user.id, { limit: 100 });
    if (error) return NextResponse.json({ error: "Could not remove your photos. Please try again." }, { status: 500 });
    if (!photos?.length) break;
    const { error: removeError } = await bucket.remove(photos.map(photo => `${user.id}/${photo.name}`));
    if (removeError) return NextResponse.json({ error: "Could not remove your photos. Please try again." }, { status: 500 });
  }
  // Revoke refresh sessions before deleting the verified caller. Never accept a user ID from the client.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) return NextResponse.json({ error: "Could not revoke your sessions. Please log in again and retry." }, { status: 500 });
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return NextResponse.json({ error: "Could not delete your account. Please log in again and retry." }, { status: 500 });
  return NextResponse.json({ success: true });
}
