import { AppError } from "@/server/lib/errors";
import { hasPermission, type Permission, type Role } from "@/server/config/rbac";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";

/**
 * Resolves the operational role for this request.
 *
 * Priority:
 * 1. Logged-in session (NextAuth) — the real source of truth. The owner
 *    assigns each staff member's role via the Team page; that role is
 *    stored on User.role and exposed via the session.
 * 2. `x-role` header — fallback for local development without a login
 *    (e.g. testing via curl/Postman). Never used once accounts exist.
 * 3. "OWNER" — final fallback for a completely fresh dev database.
 */
export async function getRoleFromRequest(req: Request): Promise<Role> {
  try {
    const session = await getServerSession(authOptions);
    const sessionRole = (session?.user as any)?.role as string | undefined;
    if (sessionRole) {
      // Pass through as-is, including "CUSTOMER" — rbac.ts permission lists
      // don't grant CUSTOMER anything on staff endpoints, so requirePermission
      // correctly returns 403 rather than falling back to a privileged role.
      return sessionRole as Role;
    }
  } catch {
    // No session available (e.g. local dev without NextAuth configured) — fall through
  }

  const headerRole = req.headers.get("x-role");
  if (headerRole) return headerRole as Role;

  return "OWNER";
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission))
    throw new AppError(`Insufficient permissions: requires ${permission}`, 403, "FORBIDDEN");
}
