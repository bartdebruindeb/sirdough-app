import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { exactAuthUrl } from "@/server/lib/exact";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.redirect(exactAuthUrl(""));
}
