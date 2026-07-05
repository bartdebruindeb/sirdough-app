import NextAuth from "next-auth";
import { authOptions } from "@/server/config/auth";
import { isRateLimited, getClientIp } from "@/server/lib/ratelimit";

const handler = NextAuth(authOptions);

export { handler as GET };

// Wrap POST to add brute-force protection on the credentials login endpoint.
// Allow 10 attempts per IP per 5 minutes.
export async function POST(req: Request, ctx: unknown) {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/callback/credentials")) {
    const ip = getClientIp(req);

    if (isRateLimited(ip, 10, 5 * 60 * 1000)) {
      return Response.json(
        { error: "Te veel pogingen. Wacht 5 minuten en probeer opnieuw." },
        { status: 429 }
      );
    }
  }
  return handler(req, ctx as any);
}
