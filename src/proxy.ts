import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isUciEmail } from "@/lib/supabase/access";

export async function proxy(request: NextRequest) {
  // Supabase falls back to Site URL when the requested redirect isn't allowlisted.
  // Preserve the authorization code so recovery still reaches the password form.
  if ((request.nextUrl.pathname === "/" || request.nextUrl.pathname === "/login") && request.nextUrl.searchParams.has("code")) {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    return NextResponse.redirect(callback);
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const publicPath = request.nextUrl.pathname === "/login" || request.nextUrl.pathname.startsWith("/auth/");
  if (!url || !key) return publicPath ? response : NextResponse.redirect(new URL("/login?auth=unavailable", request.url));
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(values) {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  const { data: { user } } = await supabase.auth.getUser();
  const verified = !!user?.email_confirmed_at && isUciEmail(user.email);
  if (request.nextUrl.pathname === "/login" && verified && !request.nextUrl.searchParams.has("auth")) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }
  if (!publicPath && !verified) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

export const config = { matcher: ["/", "/login", "/profile", "/help/:path*", "/events/:path*", "/my-events/:path*", "/friends/:path*", "/profiles/:path*", "/chat/:path*", "/auth/:path*"] };
