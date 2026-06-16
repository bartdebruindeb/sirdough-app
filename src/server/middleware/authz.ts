import { AppError } from "@/server/lib/errors";
import { hasPermission, type Permission, type Role } from "@/server/config/rbac";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";

/**
 * Resolves the operational role for this request.
 * Requires a valid NextAuth session — no unauthenticated fallback.
 */
export async function getRoleFromRequest(req: Request): Promise<Role> {
  const session = await getServerSession(authOptions);
  const sessionRole = (session?.user as any)?.role as string | undefined;
  if (sessionRole) return sessionRole as Role;

  throw new AppError("Niet ingelogd", 401, "UNAUTHENTICATED");
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission))
    throw new AppError(`Insufficient permissions: requires ${permission}`, 403, "FORBIDDEN");
}
