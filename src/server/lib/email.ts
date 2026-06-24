import { Resend } from "resend";

const FROM = process.env.RESEND_FROM ?? "Digital Bakery <onboarding@resend.dev>";
function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendOrderConfirmation({
  to, customerName, deliveryDate, lines, action,
}: {
  to: string;
  customerName: string;
  deliveryDate: string;
  lines: { name: string; quantity: number }[];
  action: "placed" | "cancelled" | "updated";
}) {
  const labels = { placed: "Bevestiging bestelling", cancelled: "Bestelling geannuleerd", updated: "Bestelling gewijzigd" };
  const subject = `${labels[action]} – ${deliveryDate}`;

  const lineRows = lines.map(l => `<tr><td style="padding:4px 0">${l.name}</td><td style="padding:4px 0;text-align:right">${l.quantity}×</td></tr>`).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
      <p style="font-size:20px;font-weight:600;margin-bottom:4px">Digital Bakery</p>
      <p style="color:#666;margin-top:0">${labels[action]}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <p>Beste ${customerName},</p>
      <p>Uw bestelling voor <strong>${deliveryDate}</strong> is ${action === "placed" ? "geplaatst" : action === "cancelled" ? "geannuleerd" : "gewijzigd"}.</p>
      ${lines.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        ${lineRows}
      </table>` : ""}
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <p style="font-size:12px;color:#999">U kunt uw bestellingen wijzigen tot 4:00 uur de ochtend vóór bezorging.</p>
    </div>`;

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendRecurringOrderConfirmation({
  to, customerName, weekday, lines,
}: {
  to: string;
  customerName: string;
  weekday: string;
  lines: { name: string; quantity: number }[];
}) {
  const subject = `Vaste bestelling gewijzigd – ${weekday}`;
  const lineRows = lines.map(l => `<tr><td style="padding:4px 0">${l.name}</td><td style="padding:4px 0;text-align:right">${l.quantity}×</td></tr>`).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
      <p style="font-size:20px;font-weight:600;margin-bottom:4px">Digital Bakery</p>
      <p style="color:#666;margin-top:0">Vaste bestelling gewijzigd</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <p>Beste ${customerName},</p>
      <p>Uw vaste bestelling voor <strong>${weekday}</strong> is bijgewerkt.</p>
      ${lines.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        ${lineRows}
      </table>` : ""}
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <p style="font-size:12px;color:#999">U kunt uw bestellingen wijzigen tot 4:00 uur de ochtend vóór bezorging.</p>
    </div>`;

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({ from: FROM, to, subject, html });
}
