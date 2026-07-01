import { NextRequest } from "next/server";
import { prisma } from "@/server/config/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password || typeof token !== "string" || typeof password !== "string") {
      return Response.json({ error: "Ongeldige aanvraag." }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: "Wachtwoord moet minimaal 8 tekens bevatten." }, { status: 400 });
    }

    const record = await (prisma as any).passwordResetToken.findUnique({
      where: { token },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return Response.json({ error: "Link is ongeldig of verlopen." }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 12);
    await Promise.all([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hash } }),
      (prisma as any).passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return Response.json({ ok: true });
  } catch (e) {
    console.error("reset-password error", e);
    return Response.json({ error: "Er is een fout opgetreden." }, { status: 500 });
  }
}
