import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { exactAuthUrl } from "@/server/lib/exact";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // CSRF protection: random state, stored in an httpOnly cookie and checked on callback
  const state = crypto.randomBytes(24).toString("hex");
  const res = NextResponse.redirect(exactAuthUrl(state));
  res.cookies.set("exact_oauth_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
  });
  return res;
}
