import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/server/config/db";
import bcrypt from "bcryptjs";

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

        const user = await prisma.user.findFirst({
          where: { email: credentials.email, active: true },
        });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

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
      }
      return token;
    },
    async session({ session, token }) {
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
  session: { strategy: "jwt" },
};
