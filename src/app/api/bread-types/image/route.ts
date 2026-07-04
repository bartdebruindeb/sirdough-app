/**
 * POST /api/bread-types/image?id=<breadTypeId>
 * Accepts multipart/form-data with a "file" field.
 * Saves to public/brood/<breadTypeId>-<timestamp>.jpg and updates BreadType.imageFile.
 * The timestamp in the filename matters: every consumer of this URL (recipe list,
 * customer order screen, the upload preview) renders a plain <img src> with no
 * cache-busting query param, so a fixed filename would mean the browser keeps showing
 * whatever it cached the very first time it requested that URL (often a 404, if the
 * item had no picture yet) even after a real image is uploaded.
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

    // Unique filename per upload so the URL changes and browsers can't serve a stale
    // cached response — see the file-level comment above.
    const filename = `${id}-${Date.now()}.jpg`;
    const dest = path.join(process.cwd(), "public", "brood", filename);

    // Best-effort cleanup of the previous file so old uploads don't pile up
    if (bt.imageFile) {
      fs.unlink(path.join(process.cwd(), "public", "brood", bt.imageFile), () => {});
    }

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(dest, buf);

    // Best-effort DB update (field may not exist until prisma generate runs)
    await (prisma as any).breadType.updateMany({ where: { id, tenantId: tid }, data: { imageFile: filename } }).catch(() => {});

    return Response.json({ ok: true, imageFile: filename });
  } catch (e) { return toResponse(e); }
}
