/**
 * POST /api/bread-types/image?id=<breadTypeId>
 * Accepts multipart/form-data with a "file" field.
 * Saves to public/brood/<breadTypeId>.<ext> and updates BreadType.imageFile.
 */
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    // Verify ownership
    const bt = await prisma.breadType.findFirst({ where: { id, tenantId: tid } });
    if (!bt) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return Response.json({ error: "no file" }, { status: 400 });

    // Accept only images
    if (!file.type.startsWith("image/")) return Response.json({ error: "not an image" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const filename = `${id}.${ext}`;
    const dest = path.join(process.cwd(), "public", "brood", filename);

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(dest, buf);

    await (prisma as any).breadType.updateMany({ where: { id, tenantId: tid }, data: { imageFile: filename } });

    return Response.json({ ok: true, imageFile: filename });
  } catch (e) { return toResponse(e); }
}
