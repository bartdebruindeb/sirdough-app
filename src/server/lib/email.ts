import { Resend } from "resend";

const FROM = process.env.RESEND_FROM ?? "Sirdough <onboarding@resend.dev>";
function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendOrderReminder({
  to, customerName, deliveryDate, cutoffLabel, lines, tenantName,
}: {
  to: string; customerName: string; deliveryDate: string; cutoffLabel: string;
  lines: { name: string; quantity: number }[]; tenantName: string;
}) {
  const lineRows = lines.map(l => `<tr><td style="padding:4px 0">${l.name}</td><td style="padding:4px 0;text-align:right;font-weight:600">${l.quantity}×</td></tr>`).join("");
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
      <p style="font-size:20px;font-weight:600;margin-bottom:4px">${tenantName}</p>
      <p style="color:#666;margin-top:0">Herinnering bestelling</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <p>Beste ${customerName},</p>
      <p>U heeft de volgende bestelling voor <strong>${deliveryDate}</strong>:</p>
      ${lines.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">${lineRows}</table>` : ""}
      <p>Wilt u iets aanpassen? Dat kan nog tot <strong>${cutoffLabel} 4:00</strong>.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <p style="font-size:12px;color:#999">U ontvangt deze herinnering automatisch twee dagen voor uw bezorgdag.</p>
    </div>`;
  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({ from: FROM, to, subject: `Herinnering bestelling ${deliveryDate}`, html });
}

export async function sendPakbon({
  to, customerName, deliveryDate, tenantName, lines, deviations = [],
}: {
  to: string; customerName: string; deliveryDate: string; tenantName: string;
  lines: { name: string; quantity: number }[];
  deviations?: { name: string; ordered: number; delivered: number }[];
}) {
  const lineRows = lines.map(l => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${l.name}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${l.quantity}×</td></tr>`).join("");
  const devRows = deviations.map(d => `<tr><td style="padding:4px 0;color:#92400e">${d.name}</td><td style="padding:4px 0;text-align:right;color:#92400e">Besteld: ${d.ordered} / Geleverd: ${d.delivered}</td></tr>`).join("");
  const devBlock = deviations.length > 0 ? `
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0">
      <p style="margin:0 0 8px;font-weight:600;color:#92400e;font-size:13px">Afwijking van bestelling</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">${devRows}</table>
      <p style="margin:8px 0 0;font-size:12px;color:#92400e">De factuur is aangepast op basis van het werkelijk geleverde aantal.</p>
    </div>` : "";
  const logoUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/logo.jpg`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
      <img src="${logoUrl}" alt="${tenantName}" style="height:48px;max-width:200px;object-fit:contain;margin-bottom:8px">
      <p style="font-size:20px;font-weight:600;margin-bottom:4px">${tenantName}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <p>Beste ${customerName},</p>
      <p>Bijgaand de bevestiging dat wij op <strong>${deliveryDate}</strong> de volgende bestelling hebben bezorgd:</p>
      ${lines.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <thead><tr>
          <th style="text-align:left;padding:6px 0;border-bottom:2px solid #ddd;color:#666;font-size:12px;text-transform:uppercase">Broodsoort</th>
          <th style="text-align:right;padding:6px 0;border-bottom:2px solid #ddd;color:#666;font-size:12px;text-transform:uppercase">Aantal</th>
        </tr></thead>
        <tbody>${lineRows}</tbody>
      </table>` : ""}
      ${devBlock}
      <p style="font-size:12px;color:#999">Heeft u vragen over uw bezorging? Neem dan contact op met de bakkerij.</p>
    </div>`;
  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({ from: FROM, to, subject: `Pakbon bezorging ${deliveryDate}`, html });
}

export async function sendPasswordReset({
  to, resetUrl,
}: {
  to: string;
  resetUrl: string;
}) {
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
      <p style="font-size:20px;font-weight:600;margin-bottom:4px">Wachtwoord opnieuw instellen</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <p>Klik op de onderstaande knop om een nieuw wachtwoord in te stellen. De link is 1 uur geldig.</p>
      <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:11px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600">
        Wachtwoord instellen
      </a>
      <p style="font-size:12px;color:#999">Heeft u dit niet aangevraagd? Dan kunt u deze e-mail negeren.</p>
      <p style="font-size:11px;color:#bbb;word-break:break-all">Of kopieer deze link: ${resetUrl}</p>
    </div>`;
  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({ from: FROM, to, subject: "Wachtwoord opnieuw instellen", html });
}
