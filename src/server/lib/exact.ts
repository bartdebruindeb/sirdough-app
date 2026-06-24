/**
 * Exact Online OAuth2 + Sales Invoice integration.
 *
 * Setup required (add to .env):
 *   EXACT_CLIENT_ID=...
 *   EXACT_CLIENT_SECRET=...
 *   EXACT_REDIRECT_URI=https://yourdomain.com/api/exact/callback
 *
 * The owner authorizes once via /api/exact/connect → tokens are stored in ExactToken.
 * All subsequent calls auto-refresh the access token.
 */

import { prisma } from "@/server/config/db";

const BASE = "https://start.exactonline.nl";
const CLIENT_ID = process.env.EXACT_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.EXACT_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.EXACT_REDIRECT_URI ?? "";

export function exactAuthUrl(state: string) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    force_login: "0",
  });
  return `${BASE}/api/oauth2/auth?${p}`;
}

export async function exchangeCode(tenantId: string, code: string) {
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
  const data = await res.json();
  await saveToken(tenantId, data);
  return data;
}

async function saveToken(tenantId: string, data: { access_token: string; refresh_token: string; expires_in: number }) {
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
    await saveToken(tenantId, data);
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
    customerName: string;
    customerEmail: string;
    invoiceDate: string; // "YYYY-MM-DD"
    lines: ExactInvoiceLine[];
    yourRef?: string;
  }
): Promise<ExactInvoiceResult | null> {
  if (!CLIENT_ID) return null; // Exact not configured

  const auth = await getAccessToken(tenantId);
  if (!auth) return null;

  let division = auth.division;
  if (!division) {
    division = await getDivision(auth.token);
    // Cache division
    await (prisma as any).exactToken.update({ where: { tenantId }, data: { division } });
  }

  // Find or create the debtor (account) in Exact by email
  const accountGuid = await findOrCreateAccount(auth.token, division, opts.customerName, opts.customerEmail);

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

async function findOrCreateAccount(token: string, division: number, name: string, email: string): Promise<string> {
  // Search by email
  const search = await fetch(
    `${BASE}/api/v1/${division}/crm/Accounts?$filter=Email eq '${encodeURIComponent(email)}'&$select=ID`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const sdata = await search.json();
  const existing = sdata.d?.results?.[0];
  if (existing) return existing.ID;

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
  const cdata = await create.json();
  return cdata.d.ID;
}
