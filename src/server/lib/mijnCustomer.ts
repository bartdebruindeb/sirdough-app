import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/server/config/auth";
import { AppError } from "@/server/lib/errors";

/** Cookie holding the customer portal's currently selected location (a customerId). */
export const MIJN_LOCATION_COOKIE = "mijn_location";

/**
 * The authorization boundary, as a pure function so it can be tested in isolation:
 * honour the client's selected location only when it's one this login actually owns,
 * otherwise fall back to the first. A forged cookie can never select a foreign location.
 */
export function resolveSelectedCustomerId(ids: string[], selected: string | null | undefined): string | null {
  if (ids.length === 0) return null;
  return selected && ids.includes(selected) ? selected : ids[0];
}

/**
 * Resolves which customer (restaurant location) the current portal request acts on.
 *
 * A login may own several locations. The client picks one via the MIJN_LOCATION_COOKIE,
 * but that value is untrusted — we only honour it when it's in the user's own set of
 * linked customers, otherwise fall back to the first. This is the authorization boundary
 * for the portal: every /api/mijn route scopes to `customerId`, so a forged cookie can
 * never reach a location the user isn't linked to.
 */
export async function getMijnContext(): Promise<{ customerId: string; customerIds: string[] }> {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const fromSession: string[] = Array.isArray(user?.customerIds) ? user.customerIds : [];
  // Back-compat during the deploy window: tokens issued before this change only carry
  // a single customerId. Treat it as a one-element set.
  const ids = fromSession.length ? fromSession : (user?.customerId ? [user.customerId as string] : []);
  if (ids.length === 0) throw new AppError("Niet ingelogd", 401, "UNAUTHENTICATED");

  const selected = cookies().get(MIJN_LOCATION_COOKIE)?.value;
  const customerId = resolveSelectedCustomerId(ids, selected)!;
  return { customerId, customerIds: ids };
}
