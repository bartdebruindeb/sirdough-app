/**
 * GET /api/brood/<filename> — serves an uploaded bread-type photo straight from disk.
 *
 * Reads public/brood/<filename> fresh on every request instead of relying on Next's
 * static /public serving, which doesn't reliably pick up files added after the server
 * process started (only after a restart) — that would mean a freshly uploaded photo
 * doesn't actually show up until the next deploy. Filenames are unique per upload
 * (<breadTypeId>-<timestamp>.jpg), so a long-lived immutable cache header is safe here.
 */
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { filename: string } }) {
  // Reject path traversal / anything that isn't a plain filename
  if (!/^[a-zA-Z0-9._-]+$/.test(params.filename)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "brood", params.filename);
  if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });

  const buf = fs.readFileSync(filePath);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
