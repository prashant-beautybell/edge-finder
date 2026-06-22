import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/dashboard/historical") {
    return NextResponse.redirect(new URL("/dashboard/racing/historical", request.url));
  }

  if (pathname === "/dashboard/today" || pathname === "/dashboard/today/") {
    return NextResponse.redirect(new URL("/dashboard/racing/today", request.url));
  }

  if (pathname.startsWith("/dashboard/today/football")) {
    const rest = pathname.replace("/dashboard/today/football", "");
    return NextResponse.redirect(new URL(`/dashboard/football/today${rest}`, request.url));
  }

  if (pathname.startsWith("/dashboard/today/")) {
    const rest = pathname.replace("/dashboard/today", "");
    return NextResponse.redirect(new URL(`/dashboard/racing/today${rest}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/today/:path*", "/dashboard/historical"],
};
