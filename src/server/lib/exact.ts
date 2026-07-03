/**
 * Exact Online OAuth2 + Sales Invoice integration.
 *
 * Setup required (add to .env, same values on every bakery deployment):
 *   EXACT_CLIENT_ID=...
 *   EXACT_CLIENT_SECRET=...            (only used locally for token refresh — the initial
 *                                        code exchange happens on the relay host, see below)
 *   EXACT_REDIRECT_URI=https://sirdough.com/api/exact/relay-callback
 *   STATE_SIGNING_SECRET=...           (shared across every bakery + the relay host)
 *   RELAY_SHARED_SECRET=...            (unique per bakery — authenticates the relay's token handoff)
 *
 * Exact only allows ONE registered redirect URI per app, but every bakery is its own
 * isolated deployment (own DB, own subdomain). To support many bakeries under one Exact
 * app registration, the OAuth "authorize" redirect always points at a single relay
 * endpoint (hosted inside one bakery deployment, reached via the apex domain). The relay
 * exchanges the code, then hands the tokens off to the correct bakery's own deployment
 * over a server-to-server call — see /api/exact/relay-callback and /api/exact/relay-receive.
 *
 * Day-to-day token refresh does NOT involve redirect_uri, so it still happens locally on
 * each bakery's own deployment using its own (duplicated) EXACT_CLIENT_ID/SECRET.
 */

import { prisma } from "@/server/config/db";
import crypto from "crypto";

const BASE = "https://start.exactonline.nl";
const CLIENT_ID = process.env.EXACT_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.EXACT_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.EXACT_REDIRECT_URI ?? "";
const STATE_SIGNING_SECRET = process.env.STATE_SIGNING_SECRET ?? "";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function exactAuthUrl(state: string) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    force_login: "0",
    state,
  });
  return `${BASE}/api/oauth2/auth?${p}`;
}

/** Stateless, self-verifying CSRF state — no cookie needed since the OAuth redirect
 * now lands on a different domain (the relay) than the one that started the flow. */
export function signState(tenant: string): string {
  const payload = Buffer.from(JSON.stringify({ tenant, nonce: crypto.randomBytes(9).toString("hex"), iat: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", STATE_SIGNING_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string): { tenant: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", STATE_SIGNING_SECRET).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const { tenant, iat } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof tenant !== "string" || typeof iat !== "number") return null;
    if (Date.now() - iat > STATE_MAX_AGE_MS) return null;
    return { tenant };
  } catch {
    return null;
  }
}

/** Pure Exact token-endpoint exchange — no DB write. Only ever called by the relay,
 * which is the one place holding the client secret + matching the registered redirect_uri. */
export async function exchangeCodeForTokens(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(`${BASE}/api/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Exact token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function storeTokens(tenantId: string, data: { access_token: string; refresh_token: string; expires_in: number }) {
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await (prisma as any).exactToken.upsert({
    where: { tenantId },
    update: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt },
    create: { tenantId, accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt },
  });
}

async function getAccessToken(tenantId: string): Promise<{ token: string; division: number | null } | null> {
  const row = await (prisma as any).exactToken.findUnique({ where: { tenantId } });
  if (!row) return null;

  // Refresh if expiring within 60 seconds
  if (new Date(row.expiresAt).getTime() - Date.now() < 60_000) {
    const res = await fetch(`${BASE}/api/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    if (!res.ok) throw new Error(`Exact token refresh failed: ${await res.text()}`);
    const data = await res.json();
    await storeTokens(tenantId, data);
    return { token: data.access_token, division: row.division };
  }

  return { token: row.accessToken, division: row.division };
}

async function getDivision(token: string): Promise<number> {
  const res = await fetch(`${BASE}/api/v1/current/Me?$select=CurrentDivision`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await res.json();
  return data.d?.results?.[0]?.CurrentDivision ?? data.CurrentDivision;
}

export async function exactConnected(tenantId: string): Promise<boolean> {
  const row = await (prisma as any).exactToken.findUnique({ where: { tenantId } });
  return !!row;
}

export interface ExactInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number; // excl. VAT
  vatCode?: string;  // defaults to "1" (9% NL low rate)
}

export interface ExactInvoiceResult {
  invoiceNumber: string;
  exactGuid: string;
}

export async function createExactInvoice(
  tenantId: string,
  opts: {
    customerId: string;
    customerName: string;
    customerEmail: string;
    invoiceDate: string; // "YYYY-MM-DD"
    lines: ExactInvoiceLine[];
    yourRef?: string;
  }
): Promise<ExactInvoiceResult | null> {
  if (!CLIENT_ID) {
    console.error("Exact invoice skipped: EXACT_CLIENT_ID is not set in this process's environment");
    return null;
  }

  const auth = await getAccessToken(tenantId);
  if (!auth) {
    console.error(`Exact invoice skipped: no ExactToken row for tenantId=${tenantId} (not connected, or connected under a different tenantId)`);
    return null;
  }

  let division = auth.division;
  if (!division) {
    division = await getDivision(auth.token);
    // Cache division
    await (prisma as any).exactToken.update({ where: { tenantId }, data: { division } });
  }

  // Reuse the cached Exact account if we've already linked this customer — avoids a
  // fresh email search (and possible mismatch/duplicate) on every single invoice.
  const customer = await prisma.customer.findUnique({ where: { id: opts.customerId } });
  let accountGuid: string;
  if (customer?.exactAccountId) {
    accountGuid = customer.exactAccountId;
  } else {
    const account = await findOrCreateAccount(auth.token, division, opts.customerName, opts.customerEmail);
    accountGuid = account.guid;
    await prisma.customer.update({
      where: { id: opts.customerId },
      data: { exactAccountId: account.guid, exactCustomerCode: account.code },
    });
  }

  const body = {
    d: {
      InvoiceDate: `/Date(${new Date(opts.invoiceDate + "T12:00:00Z").getTime()})/`,
      OrderedBy: accountGuid,
      YourRef: opts.yourRef ?? "",
      SalesInvoiceLines: {
        results: opts.lines.map(l => ({
          Description: l.description,
          Quantity: l.quantity,
          UnitPrice: l.unitPrice,
          VATCode: l.vatCode ?? "1",
        })),
      },
    },
  };

  const res = await fetch(`${BASE}/api/v1/${division}/salesinvoice/SalesInvoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("Exact create invoice failed:", await res.text());
    return null;
  }

  const data = await res.json();
  const inv = data.d;
  return {
    invoiceNumber: String(inv.InvoiceNumber),
    exactGuid: inv.InvoiceID,
  };
}

async function findOrCreateAccount(token: string, division: number, name: string, email: string): Promise<{ guid: string; code: string | null }> {
  // Search by email
  const search = await fetch(
    `${BASE}/api/v1/${division}/crm/Accounts?$filter=Email eq '${encodeURIComponent(email)}'&$select=ID,Code`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!search.ok) throw new Error(`Exact account search failed: ${await search.text()}`);
  const sdata = await search.json();
  const existing = sdata.d?.results?.[0];
  if (existing) return { guid: existing.ID, code: existing.Code ?? null };

  // Create new account
  const create = await fetch(`${BASE}/api/v1/${division}/crm/Accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ d: { Name: name, Email: email, IsCustomer: true } }),
  });
  if (!create.ok) throw new Error(`Exact account creation failed: ${await create.text()}`);
  const cdata = await create.json();
  return { guid: cdata.d.ID, code: cdata.d.Code ?? null };
}
