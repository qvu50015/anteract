import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmationDestination } from "@/lib/supabase/access";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token_hash = params.get("token_hash");
  const type = params.get("type");
  if (token_hash && (type === "signup" || type === "recovery" || type === "email")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/auth/reset-password" : confirmationDestination(params.get("next")), request.url));
  }
  return NextResponse.redirect(new URL("/login?auth=invalid-link", request.url));
}
