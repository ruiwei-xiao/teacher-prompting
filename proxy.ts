import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const config = {
  matcher: ["/create", "/app/:path*", "/api/apps", "/api/apps/:path*"],
};

export const proxy = auth((req) => {
  if (req.auth) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/", req.nextUrl.origin);
  signInUrl.searchParams.set(
    "callbackUrl",
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  );
  return NextResponse.redirect(signInUrl);
});
