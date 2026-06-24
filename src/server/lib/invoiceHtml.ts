export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export function buildInvoiceHtml(opts: {
  customerName: string;
  invoiceNumber: string;
  week: string;
  lines: InvoiceLine[];
  totalExcl: number;
  vatPercent: number;
}) {
  const vat = opts.totalExcl * (opts.vatPercent / 100);
  const total = opts.totalExcl + vat;
  const [year, wn] = opts.week.split("-W");

  const rows = opts.lines.map(l => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #f0ebe5;font-size:13px">${l.description}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0ebe5;text-align:center;font-size:13px">${l.quantity}×</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0ebe5;text-align:right;color:#888;font-size:13px">€ ${l.unitPrice.toFixed(2)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0ebe5;text-align:right;font-weight:500;font-size:13px">€ ${l.lineTotal.toFixed(2)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Factuur ${opts.invoiceNumber}</title>
</head>
<body style="margin:0;padding:24px;background:#f9f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:#2c1810;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">Digital Bakery</p>
      <p style="margin:4px 0 0;font-size:13px;color:#c4a882">Ambachtelijk brood</p>
    </div>
    <div style="text-align:right">
      <p style="margin:0;font-size:13px;color:#c4a882">Factuur</p>
      <p style="margin:2px 0 0;font-size:18px;font-weight:600;color:#fff">${opts.invoiceNumber}</p>
    </div>
  </div>

  <!-- Meta -->
  <div style="padding:24px 32px;border-bottom:1px solid #f0ebe5;display:flex;justify-content:space-between">
    <div>
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa">Aan</p>
      <p style="margin:4px 0 0;font-size:14px;font-weight:600">${opts.customerName}</p>
    </div>
    <div style="text-align:right">
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa">Periode</p>
      <p style="margin:4px 0 0;font-size:14px;font-weight:500">Week ${wn}, ${year}</p>
    </div>
  </div>

  <!-- Lines -->
  <div style="padding:0 32px">
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead>
        <tr style="background:#faf7f4">
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;font-weight:600">Omschrijving</th>
          <th style="padding:8px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;font-weight:600">Aantal</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;font-weight:600">Prijs</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;font-weight:600">Totaal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <!-- Totals -->
  <div style="padding:0 32px 28px">
    <table style="width:100%;font-size:13px">
      <tr>
        <td style="padding:4px 10px;color:#888">Subtotaal excl. BTW</td>
        <td style="padding:4px 10px;text-align:right">€ ${opts.totalExcl.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:4px 10px;color:#888">BTW ${opts.vatPercent}%</td>
        <td style="padding:4px 10px;text-align:right">€ ${vat.toFixed(2)}</td>
      </tr>
      <tr style="border-top:2px solid #f0ebe5">
        <td style="padding:10px 10px 4px;font-weight:700;font-size:15px">Totaal incl. BTW</td>
        <td style="padding:10px 10px 4px;text-align:right;font-weight:700;font-size:15px;color:#8b4513">€ ${total.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="background:#faf7f4;padding:16px 32px;border-top:1px solid #f0ebe5">
    <p style="margin:0;font-size:11px;color:#aaa;text-align:center">Digital Bakery &nbsp;·&nbsp; Factuur ${opts.invoiceNumber}</p>
  </div>

</div>
</body></html>`;
}
