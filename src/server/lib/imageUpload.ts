import { AppError } from "./errors";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Sniffs the leading magic bytes for the raster formats a browser <img> renders.
 * Trusting file.type (client-set) alone lets a caller store arbitrary bytes under
 * an image content-type — check the real header instead.
 */
function isImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // GIF: "GIF"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  // WEBP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return true;
  return false;
}

/** Validates an uploaded image File (size + real content) and returns its bytes, or throws AppError. */
export async function readImageUpload(file: File): Promise<Buffer> {
  if (file.size > MAX_BYTES) throw new AppError("Afbeelding is te groot (max 5 MB).", 413, "FILE_TOO_LARGE");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!isImage(buf)) throw new AppError("Geen geldige afbeelding.", 400, "NOT_AN_IMAGE");
  return buf;
}
