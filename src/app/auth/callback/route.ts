import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmationDestination } from "@/lib/supabase/access";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    // Auth JS returns the PKCE recovery marker at runtime, but omits it from
    // the public response type. Keep the explicit next parameter as a fallback.
    const redirectType = "redirectType" in data && typeof data.redirectType === "string" ? data.redirectType : null;
    if (!error) return NextResponse.redirect(new URL(confirmationDestination(request.nextUrl.searchParams.get("next"), redirectType), request.url));
  }
  return NextResponse.redirect(new URL("/login?auth=invalid-link", request.url));
}
