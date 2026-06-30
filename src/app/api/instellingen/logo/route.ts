/**
 * POST /api/instellingen/logo
 * Accepts multipart/form-data with a "file" field.
 * Saves to public/logo.jpg (used on facturen and in de pakbon-email).
 */
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { toResponse } from "@/server/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return Response.json({ error: "no file" }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "not an image" }, { status: 400 });

    const dest = path.join(process.cwd(), "public", "logo.jpg");
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(dest, buf);

    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
