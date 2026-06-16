import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/digitalbakery/login",
  },
  callbacks: {
    authorized: ({ token }) => {
      // Allow any logged-in staff account (not CUSTOMER) into the staff app
      return !!token && token.role !== "CUSTOMER";
    },
  },
});

export const config = {
  // Protect everything except the login page, NextAuth API routes,
  // the customer invite/onboarding page, and Next.js internals/static assets.
  matcher: [
    "/((?!login|api/auth|uitnodiging|_next/static|_next/image|favicon.ico).*)",
  ],
};
