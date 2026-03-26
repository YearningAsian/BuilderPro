import { NextRequest, NextResponse } from "next/server";

const AUTH_ROUTES = new Set(["/signin", "/signup", "/join-invite", "/forgot-password"]);

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAuthRoute = AUTH_ROUTES.has(pathname);
  const isAuthed = request.cookies.get("builderpro_auth")?.value === "1";

  if (!isAuthed && !isAuthRoute) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/signin";
    signInUrl.search = "";
    const nextPath = pathname === "/" ? "/" : `${pathname}${search}`;
    signInUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(signInUrl);
  }

  if (isAuthed && isAuthRoute) {
    const role = request.cookies.get("builderpro_role")?.value;
    const destination = role === "user" ? "/projects" : "/";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
