import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    const path = req.nextUrl.pathname;
    // Redirect ORDER_TABLET away from the dashboard
    if (token?.role === "ORDER_TABLET" && path === "/") {
      return NextResponse.redirect(new URL("/bestellingen", req.url));
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
