import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that never require authentication
// /q/<token> is the customer quote page: reached from an emailed link, never signed in.
// /careers/<companyId> is the public career page: reached from the company's own site, never signed in.
const PUBLIC_PATHS = ["/login", "/register", "/q", "/careers"];

// Static/system paths that should bypass middleware entirely
const BYPASS_PREFIXES = [
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.json",
  "/icons/",
  "/images/",
  "/fonts/",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let static/system files through without any checks
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Let public auth pages through
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Let API routes through (handled by the backend)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Check for the lightweight session indicator cookie.
  // The actual JWT is in sessionStorage (client-only); the cookie is just a
  // presence signal for the middleware edge layer.
  const hasSession = request.cookies.get("sttps_session");

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    // Only pass ?next= for non-root paths to avoid a /login?next=/ loop
    if (pathname !== "/" && pathname !== "/login") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.json).*)",
  ],
};
