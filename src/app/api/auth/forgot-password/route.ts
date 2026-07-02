import { NextRequest } from "next/server";
import { prisma } from "@/server/config/db";
import { sendPasswordReset } from "@/server/lib/email";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return Response.json({ ok: true }); // don't reveal anything
    }

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), active: true },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await (prisma as any).passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });

      const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      await sendPasswordReset({
        to: user.email!, // guaranteed non-null: matched by exact email filter above
        resetUrl: `${base}/login/reset-password?token=${token}`,
      });
    }

    // Always return ok — never reveal whether email exists
    return Response.json({ ok: true });
  } catch (e) {
    console.error("forgot-password error", e);
    return Response.json({ ok: true }); // swallow to avoid leaking info
  }
}
