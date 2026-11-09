import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Issues the anonymous homepage-assignment id.
 *
 * A Server Component cannot set cookies, so without this the homepage would
 * assign a new random design on every request and the page would visibly change
 * on refresh. The middleware sets the id before the page renders, which makes
 * the assignment stable from the very first visit.
 *
 * The id is a random opaque string used only to look up the pinned design. It is
 * httpOnly and carries no personal data.
 */
const COOKIE = "nd_visitor";

function newId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const existing = request.cookies.get(COOKIE)?.value;
  if (!existing || !/^[a-f0-9]{32}$/.test(existing)) {
    response.cookies.set(COOKIE, newId(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365
    });
  }
  return response;
}

export const config = {
  // Only the pages that read the assignment need it.
  matcher: ["/", "/designs"]
};
