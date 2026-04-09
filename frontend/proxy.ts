import { NextRequest, NextResponse } from "next/server";

const AUTH_ROUTES = new Set(["/signin", "/signup", "/join-invite", "/forgot-password"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAuthRoute = AUTH_ROUTES.has(pathname);
  const hasAuthPresenceCookie = request.cookies.get("builderpro_auth")?.value === "1";

  if (!hasAuthPresenceCookie && !isAuthRoute) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/signin";
    signInUrl.search = "";
    const nextPath = pathname === "/" ? "/" : `${pathname}${search}`;
    signInUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(signInUrl);
  }

  if (hasAuthPresenceCookie && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
