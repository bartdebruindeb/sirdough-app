import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    const path = req.nextUrl.pathname;
    // The dashboard ("/") is owner-only — route any other staff role to their own
    // landing page. (Customers are handled by the block below.)
    if (path === "/" && token?.role && token.role !== "OWNER" && token.role !== "CUSTOMER") {
      const home = token.role === "ORDER_TABLET" ? "/bestellingen" : "/productie";
      return NextResponse.redirect(new URL(home, req.url));
    }
    // Redirect customers to their portal (skip API routes)
    if (token?.role === "CUSTOMER" && !path.startsWith("/mijn-") && !path.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/mijn-bestellingen", req.url));
    }
    // Redirect staff away from customer portal paths
    if (token?.role && token.role !== "CUSTOMER" && path.startsWith("/mijn-")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  // Protect everything except the login page, NextAuth API routes,
  // the customer invite/onboarding page, Next.js internals/static assets,
  // and the two Exact OAuth relay endpoints — those are hit directly by Exact's
  // redirect (no session cookie exists on the apex domain) and by the relay's own
  // server-to-server handoff, and are authenticated by signed state / a shared
  // secret header instead of a session.
  matcher: [
    "/((?!login|api/auth|api/exact/relay-callback|api/exact/relay-receive|uitnodiging|_next/static|_next/image|favicon.ico|brood/).*)",
  ],
};
