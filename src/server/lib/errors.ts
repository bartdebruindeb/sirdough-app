export class AppError extends Error {
  status: number; code: string; details?: unknown;
  constructor(message: string, status = 400, code = "BAD_REQUEST", details?: unknown) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
export function toResponse(err: unknown) {
  if (err instanceof AppError)
    return Response.json({ error: err.code, message: err.message, details: err.details }, { status: err.status });
  console.error(err);
  return Response.json({ error: "INTERNAL_SERVER_ERROR", message: "Unexpected error" }, { status: 500 });
}
