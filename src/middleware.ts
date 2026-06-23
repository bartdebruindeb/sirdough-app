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
    // Redirect customers to their portal
    if (token?.role === "CUSTOMER" && !path.startsWith("/mijn-")) {
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
      authorized: ({ token, req }) => {
        if (!token) return false;
        // Customer portal paths are accessible to CUSTOMER role
        const path = req.nextUrl.pathname;
        if (token.role === "CUSTOMER") {
          return path.startsWith("/mijn-");
        }
        return true;
      },
    },
  }
);

export const config = {
  // Protect everything except the login page, NextAuth API routes,
  // the customer invite/onboarding page, and Next.js internals/static assets.
  matcher: [
    "/((?!login|api/auth|uitnodiging|_next/static|_next/image|favicon.ico).*)",
  ],
};
