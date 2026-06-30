import React from "react";
import fs from "fs";
import path from "path";
import {
  Document, Page, Text, View, Image, StyleSheet, renderToBuffer,
} from "@react-pdf/renderer";
import { prisma } from "@/server/config/db";

function loadLogo(): string | null {
  try {
    const p = path.join(process.cwd(), "public", "logo.jpeg");
    if (!fs.existsSync(p)) return null;
    return "data:image/jpeg;base64," + fs.readFileSync(p).toString("base64");
  } catch { return null; }
}
const LOGO_DATA = loadLogo();

// Use Helvetica (built-in, no external font needed)

const C = {
  black: "#1a1a1a",
  grey: "#555",
  lightGrey: "#888",
  border: "#d0c8c0",
  bg: "#f7f3ef",
  accent: "#2c1810",
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: C.black, paddingTop: 36, paddingHorizontal: 40, paddingBottom: 48 },
  row: { flexDirection: "row" },
  col: { flex: 1 },

  // Header
  headerLeft: { flex: 1, paddingRight: 16 },
  headerRight: { width: 200, borderLeft: `1pt solid ${C.border}`, paddingLeft: 10 },
  companyName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyLine: { fontSize: 8.5, color: C.grey, marginBottom: 1.5 },
  companyLabel: { width: 36, color: C.lightGrey, fontSize: 8 },
  companyValue: { flex: 1, fontSize: 8.5 },

  // To address
  toLabel: { fontSize: 8, color: C.lightGrey, marginBottom: 3, marginTop: 20 },
  toName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  toLine: { fontSize: 8.5, color: C.grey, marginBottom: 1.5 },

  // Title
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 10 },

  // Meta grid
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 90, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  metaColon: { width: 10, fontSize: 8.5 },
  metaValue: { flex: 1, fontSize: 8.5, color: C.grey },

  // Table
  tableHeader: { flexDirection: "row", borderTop: `1pt solid ${C.black}`, borderBottom: `1pt solid ${C.black}`, paddingVertical: 4, marginTop: 12 },
  tableRow: { flexDirection: "row", paddingVertical: 5, borderBottom: `0.5pt solid ${C.border}` },
  dateRow: { paddingVertical: 4, paddingTop: 8 },
  dateText: { fontSize: 8.5, color: C.grey, fontFamily: "Helvetica-Oblique" },

  colDesc: { flex: 1, paddingRight: 6 },
  colQty: { width: 52, textAlign: "right", paddingRight: 6 },
  colPrice: { width: 52, textAlign: "right", paddingRight: 6 },
  colNetto: { width: 52, textAlign: "right", paddingRight: 6 },
  colBtw: { width: 28, textAlign: "right", paddingRight: 6 },
  colTotal: { width: 56, textAlign: "right" },

  thText: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  tdText: { fontSize: 8.5 },
  tdGrey: { fontSize: 8.5, color: C.grey },

  // Totals
  totalsBlock: { marginTop: 12, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", paddingVertical: 2 },
  totalLabel: { width: 140, textAlign: "right", paddingRight: 8, fontSize: 8.5, color: C.grey },
  totalValue: { width: 60, textAlign: "right", fontSize: 8.5 },
  totalBold: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  totalLine: { borderTop: `1.5pt solid ${C.black}`, marginBottom: 2 },

  // Footer
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, borderTop: `0.5pt solid ${C.border}`, paddingTop: 6 },
  footerText: { fontSize: 7.5, color: C.lightGrey, textAlign: "center" },
});

export interface PdfInvoiceData {
  // Owner / sender
  companyName: string;
  companyAddress?: string | null;
  companyPostal?: string | null;
  companyCity?: string | null;
  kvk?: string | null;
  btwNumber?: string | null;
  iban?: string | null;
  bic?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  paymentTermDays: number;
  paymentCondition: string;
  // Customer
  customerName: string;
  customerAddress?: string | null;
  customerPostal?: string | null;
  customerCity?: string | null;
  customerEmail?: string | null;
  customerNumber?: number | null;
  // Invoice meta
  invoiceNumber: string;
  invoiceDate: string;   // "DD-MM-YYYY"
  dueDate: string;       // "DD-MM-YYYY"
  // Lines grouped by delivery date
  deliveryGroups: {
    date: string;        // "Ma 23 jun 2025"
    lines: { description: string; quantity: number; unitPrice: number; vatPct: number }[];
  }[];
  vatPercent: number;
  totalExcl: number;
}

function fmt(n: number) { return n.toFixed(2).replace(".", ","); }

function InvoiceDoc({ d }: { d: PdfInvoiceData }) {
  const vat = d.totalExcl * (d.vatPercent / 100);
  const total = d.totalExcl + vat;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={s.row}>
          {/* Logo (left) */}
          <View style={s.headerLeft}>
            {LOGO_DATA
              ? <Image src={LOGO_DATA} style={{ width: 80, height: 80, objectFit: "contain" }} />
              : <View style={{ width: 80, height: 80 }} />
            }
          </View>

          {/* Company info (right) */}
          <View style={s.headerRight}>
            <Text style={s.companyName}>{d.companyName}</Text>
            {d.companyAddress && <Text style={s.companyLine}>{d.companyAddress}</Text>}
            {(d.companyPostal || d.companyCity) && <Text style={s.companyLine}>{[d.companyPostal, d.companyCity].filter(Boolean).join("  ")}</Text>}
            <Text style={s.companyLine}> </Text>
            {d.kvk        && <View style={s.row}><Text style={s.companyLabel}>KvK:</Text><Text style={s.companyValue}>{d.kvk}</Text></View>}
            {d.btwNumber  && <View style={s.row}><Text style={s.companyLabel}>BTW:</Text><Text style={s.companyValue}>{d.btwNumber}</Text></View>}
            {d.iban       && <View style={s.row}><Text style={s.companyLabel}>IBAN:</Text><Text style={s.companyValue}>{d.iban}</Text></View>}
            {d.bic        && <View style={s.row}><Text style={s.companyLabel}>BIC:</Text><Text style={s.companyValue}>{d.bic}</Text></View>}
            {d.companyPhone   && <View style={s.row}><Text style={s.companyLabel}>Tel.:</Text><Text style={s.companyValue}>{d.companyPhone}</Text></View>}
            {d.companyEmail   && <View style={s.row}><Text style={s.companyLabel}>E-mail:</Text><Text style={s.companyValue}>{d.companyEmail}</Text></View>}
            {d.companyWebsite && <View style={s.row}><Text style={s.companyLabel}>Website:</Text><Text style={s.companyValue}>{d.companyWebsite}</Text></View>}
          </View>
        </View>

        {/* ── Bill-to address ─────────────────────────────────── */}
        <Text style={s.toLabel}>T.a.v.</Text>
        <Text style={s.toName}>{d.customerName}</Text>
        {d.customerAddress && <Text style={s.toLine}>{d.customerAddress}</Text>}
        {(d.customerPostal || d.customerCity) && <Text style={s.toLine}>{[d.customerPostal, d.customerCity].filter(Boolean).join("  ")}</Text>}
        {d.customerEmail && <Text style={s.toLine}>{d.customerEmail}</Text>}

        {/* ── Title + meta ────────────────────────────────────── */}
        <Text style={s.title}>Factuur</Text>
        <View style={s.row}>
          <View style={s.col}>
            <View style={s.metaRow}><Text style={s.metaLabel}>Factuurnummer</Text><Text style={s.metaColon}>:</Text><Text style={s.metaValue}>{d.invoiceNumber}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Factuurdatum</Text><Text style={s.metaColon}>:</Text><Text style={s.metaValue}>{d.invoiceDate}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Vervaldatum</Text><Text style={s.metaColon}>:</Text><Text style={s.metaValue}>{d.dueDate}</Text></View>
          </View>
          <View style={s.col}>
            {d.customerNumber != null && <View style={s.metaRow}><Text style={s.metaLabel}>Klantnummer</Text><Text style={s.metaColon}>:</Text><Text style={s.metaValue}>{d.customerNumber}</Text></View>}
            <View style={s.metaRow}><Text style={s.metaLabel}>Betalingstermijn</Text><Text style={s.metaColon}>:</Text><Text style={s.metaValue}>{d.paymentCondition}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Pagina</Text><Text style={s.metaColon}>:</Text><Text style={s.metaValue}>1/1</Text></View>
          </View>
        </View>

        {/* ── Table ───────────────────────────────────────────── */}
        <View style={s.tableHeader}>
          <Text style={[s.colDesc, s.thText]}>Omschrijving</Text>
          <Text style={[s.colQty, s.thText]}>Aantal</Text>
          <Text style={[s.colPrice, s.thText]}>Prijs</Text>
          <Text style={[s.colNetto, s.thText]}>Netto prijs</Text>
          <Text style={[s.colBtw, s.thText]}>Btw</Text>
          <Text style={[s.colTotal, s.thText]}>Totaalbedrag</Text>
        </View>

        {d.deliveryGroups.map((g, gi) => (
          <View key={gi}>
            <View style={s.dateRow}>
              <Text style={s.dateText}>{g.date}</Text>
            </View>
            {g.lines.map((l, li) => {
              const lineTotal = l.quantity * l.unitPrice;
              return (
                <View key={li} style={s.tableRow}>
                  <Text style={[s.colDesc, s.tdText]}>{l.description}</Text>
                  <Text style={[s.colQty, s.tdText]}>{l.quantity.toFixed(2)} Stuk</Text>
                  <Text style={[s.colPrice, s.tdText]}>€ {fmt(l.unitPrice)}</Text>
                  <Text style={[s.colNetto, s.tdText]}>€ {fmt(l.unitPrice)}</Text>
                  <Text style={[s.colBtw, s.tdGrey]}>{l.vatPct}%</Text>
                  <Text style={[s.colTotal, s.tdText]}>€ {fmt(lineTotal)}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {/* ── Totals ──────────────────────────────────────────── */}
        <View style={s.totalsBlock}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Totaal excl. btw</Text>
            <Text style={s.totalValue}>€ {fmt(d.totalExcl)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>BTW te betalen {d.vatPercent}% exclusief</Text>
            <Text style={s.totalValue}>€ {fmt(vat)}</Text>
          </View>
          <View style={[s.totalRow, s.totalLine]}>
            <Text style={[s.totalLabel, s.totalBold]}>Totaal te voldoen</Text>
            <Text style={[s.totalValue, s.totalBold]}>€ {fmt(total)}</Text>
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Wij verzoeken u vriendelijk het verschuldigde bedrag binnen {d.paymentTermDays} dagen over te maken naar IBAN {d.iban ?? "—"} ten name van {d.companyName} onder vermelding van {d.invoiceNumber}.
          </Text>
        </View>

      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(data: PdfInvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc d={data} />);
}

function nlDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtInvoiceDate(d: Date) {
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Build PdfInvoiceData from DB — shared between generate (preview) and send */
export async function buildPdfData(
  tenantId: string,
  customerId: string,
  orderIds: string[],
  week: string,
  vatPercent: number,
  invoiceNumber: string | null,
  billingEntityId?: string | null,
): Promise<PdfInvoiceData> {
  const [tenant, customer, orders, billingEntity] = await Promise.all([
    (prisma as any).tenant.findUnique({ where: { id: tenantId } }),
    (prisma as any).customer.findUnique({ where: { id: customerId, tenantId } }),
    prisma.oneOffOrder.findMany({
      where: { id: { in: orderIds }, tenantId },
      include: { lines: { include: { breadType: true } } },
      orderBy: { deliveryDate: "asc" },
    }),
    billingEntityId
      ? (prisma as any).billingEntity.findUnique({ where: { id: billingEntityId } })
      : (prisma as any).billingEntity.findFirst({ where: { tenantId, isDefault: true } }),
  ]);

  // Use billing entity if found, fall back to tenant fields
  const biller = billingEntity ?? tenant;

  const discount: number = customer?.discountPercent ?? 0;

  // Group lines by delivery date
  const groups = new Map<string, { date: string; lines: PdfInvoiceData["deliveryGroups"][0]["lines"] }>();
  let totalExcl = 0;

  for (const o of orders) {
    const dateKey = o.deliveryDate.toISOString().slice(0, 10);
    const dateLabel = nlDate(dateKey);
    if (!groups.has(dateKey)) groups.set(dateKey, { date: dateLabel, lines: [] });
    for (const l of o.lines) {
      const price = (l.breadType as any).price ? Number((l.breadType as any).price) : 0;
      const unitPrice = price * (1 - discount / 100);
      totalExcl += unitPrice * l.quantity;
      groups.get(dateKey)!.lines.push({
        description: l.breadType.name,
        quantity: l.quantity,
        unitPrice,
        vatPct: vatPercent,
      });
    }
  }

  const invoiceDate = new Date();
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + (tenant?.paymentTermDays ?? 30));

  const nr = invoiceNumber ?? `DBK-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}`;

  return {
    companyName: biller?.name ?? biller?.companyName ?? tenant?.name ?? "Digital Bakery",
    companyAddress: biller?.companyAddress,
    companyPostal: biller?.companyPostal,
    companyCity: biller?.companyCity,
    kvk: biller?.kvk,
    btwNumber: biller?.btwNumber,
    iban: biller?.iban,
    bic: biller?.bic,
    companyPhone: biller?.companyPhone,
    companyEmail: biller?.companyEmail,
    companyWebsite: biller?.companyWebsite,
    paymentTermDays: biller?.paymentTermDays ?? 30,
    paymentCondition: biller?.paymentCondition ?? "30 dagen",
    customerName: customer?.name ?? "",
    customerAddress: customer?.address,
    customerPostal: customer?.postalCode,
    customerCity: customer?.city,
    customerEmail: customer?.email,
    customerNumber: customer?.customerNumber,
    invoiceNumber: nr,
    invoiceDate: fmtInvoiceDate(invoiceDate),
    dueDate: fmtInvoiceDate(dueDate),
    deliveryGroups: [...groups.values()],
    vatPercent,
    totalExcl,
  };
}
