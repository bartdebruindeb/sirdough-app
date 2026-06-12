import { z } from "zod";
import { AppError } from "./errors";
export async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try { body = await req.json(); } catch { throw new AppError("Invalid JSON", 400, "BAD_REQUEST"); }
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("Validation failed", 400, "VALIDATION_ERROR", result.error.flatten());
  return result.data;
}
