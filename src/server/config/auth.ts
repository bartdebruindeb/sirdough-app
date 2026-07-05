import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/server/config/db";
import { isLockedOut, recordFailure, clearFailures } from "@/server/lib/ratelimit";
import bcrypt from "bcryptjs";

// Lock an account after this many failed password attempts within the window.
// Temporary (auto-unlocks) to bound the DoS an attacker gets by deliberately
// failing logins for a known email — see the note in ratelimit.ts.
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email & wachtwoord",
      credentials: {
        email:    { label: "E-mailadres", type: "email" },
        password: { label: "Wachtwoord",  type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Per-account lockout: keyed by email so it catches a distributed brute-force
        // (many IPs, one account) that the per-IP limiter in the route can't see.
        // Keyed uniformly whether or not the user exists, so lockout behaviour never
        // reveals which emails are real.
        const failKey = `login:${credentials.email.toLowerCase().trim()}`;
        if (isLockedOut(failKey, LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW_MS)) return null;

        const user = await prisma.user.findFirst({
          where: { email: credentials.email, active: true },
        });
        if (!user || !user.passwordHash) {
          recordFailure(failKey, LOGIN_FAIL_WINDOW_MS);
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          recordFailure(failKey, LOGIN_FAIL_WINDOW_MS);
          return null;
        }

        clearFailures(failKey);

        // Find linked customer for customer role
        const customer = await prisma.customer.findFirst({
          where: { userId: user.id },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
          tenantId: user.tenantId,
          customerId: customer?.id ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role     = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.customerId = (user as any).customerId;
        return token;
      }
      // Subsequent requests: re-validate against the DB so deactivating a user or
      // changing their role takes effect within one request, instead of the stateless
      // JWT staying valid for up to maxAge. (token.sub === user.id.)
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { active: true, role: true },
        });
        if (!dbUser || !dbUser.active) {
          (token as any).invalid = true;
          token.role = undefined;
          (token as any).customerId = undefined;
        } else {
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Revoked mid-session (deactivated) — hand back a session with no user so every
      // downstream authz check fails closed.
      if ((token as any).invalid) {
        (session as any).user = undefined;
        return session;
      }
      if (session.user) {
        (session.user as any).role       = token.role;
        (session.user as any).tenantId   = token.tenantId;
        (session.user as any).customerId = token.customerId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
};
