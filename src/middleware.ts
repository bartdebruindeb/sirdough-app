import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    // Redirect ORDER_TABLET away from the dashboard to bestellingen
    if (token?.role === "ORDER_TABLET" && req.nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL("/bestellingen", req.url));
    }
    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
    callbacks: {
      authorized: ({ token }) => {
        return !!token && token.role !== "CUSTOMER";
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
