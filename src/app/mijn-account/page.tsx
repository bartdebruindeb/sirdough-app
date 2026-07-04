"use client";
import { useEffect, useState } from "react";

const inp: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px",
  fontSize: 14, background: "var(--surface)", width: "100%", color: "var(--text)",
};

// Uses structured fq filters (exact match on postcode + huisnummer) instead of a
// free-text q= query — free-text search is fuzzy and can match a nearby postcode
// when there's no exact hit for the given house number (same fix as klanten/page.tsx).
async function pdokLookup(postcode: string, huisnummer: string, huisletter: string) {
  const pc = postcode.replace(/\s/g, "").toUpperCase();
  const params = new URLSearchParams({ q: "*", fq: "type:adres", fl: "straatnaam,woonplaatsnaam,centroide_ll", rows: "1" });
  params.append("fq", `postcode:${pc}`);
  params.append("fq", `huisnummer:${huisnummer}`);
  if (huisletter) params.append("fq", `huisletter:${huisletter}`);
  const res = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?${params}`);
  const data = await res.json();
  const doc = data.response?.docs?.[0];
  if (!doc) return null;
  return { straat: doc.straatnaam as string, stad: doc.woonplaatsnaam as string };
}

function parseHuisnr(addr: string) {
  const m = addr.match(/(\d+)\s*([a-zA-Z]?)$/);
  return { huisnummer: m?.[1] ?? "", huisletter: m?.[2] ?? "" };
}

export default function MijnAccountPage() {
  const [name, setName]     = useState("");
  const [phone, setPhone]   = useState("");
  const [email, setEmail]   = useState("");
  const [kvk, setKvk]       = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  // Address state
  const [postcode, setPostcode]       = useState("");
  const [huisnummer, setHuisnummer]   = useState("");
  const [huisletter, setHuisletter]   = useState("");
  const [foundStraat, setFoundStraat] = useState("");
  const [foundStad, setFoundStad]     = useState("");
  const [lookupStatus, setLookupStatus] = useState<"idle"|"looking"|"found"|"fail">("idle");

  useEffect(() => {
    fetch("/api/mijn/account").then(r => r.json()).then(d => {
      setName(d.name ?? "");
      setPhone(d.phone ?? "");
      setEmail(d.email ?? "");
      setKvk(d.kvk ?? "");
      setPostcode(d.postalCode ?? "");
      setFoundStraat(d.address ?? "");
      setFoundStad(d.city ?? "");
      if (d.address) {
        const { huisnummer: hn, huisletter: hl } = parseHuisnr(d.address);
        setHuisnummer(hn); setHuisletter(hl);
        setLookupStatus("found");
      }
    });
  }, []);

  async function doLookup() {
    if (!postcode.trim() || !huisnummer.trim()) return;
    setLookupStatus("looking");
    const result = await pdokLookup(postcode, huisnummer, huisletter);
    if (result) {
      setFoundStraat(`${result.straat} ${huisnummer}${huisletter}`.trim());
      setFoundStad(result.stad);
      setLookupStatus("found");
    } else {
      setLookupStatus("fail");
    }
  }

  async function saveProfile() {
    setSaving(true);
    await fetch("/api/mijn/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, phone, kvk,
        address:    lookupStatus === "found" ? foundStraat : undefined,
        postalCode: lookupStatus === "found" ? postcode.trim().toUpperCase() : undefined,
        city:       lookupStatus === "found" ? foundStad : undefined,
      }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <h1 style={{ fontSize: 26, margin: 0 }}>Mijn account</h1>

      {/* Profile */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: 16, margin: "0 0 1rem" }}>Gegevens</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Bedrijfsnaam</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>E-mailadres</label>
            <input value={email} disabled style={{ ...inp, opacity: 0.6 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Telefoonnummer</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="+31 6 ..." />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>KvK-nummer *</label>
            <input value={kvk} onChange={e => setKvk(e.target.value)} style={inp} placeholder="12345678" />
          </div>
        </div>
        {!kvk.trim() && <p style={{ fontSize: 12, color: "#f97316", marginTop: 10, marginBottom: 0 }}>⚠ Vul je KvK-nummer in — dit wordt gebruikt om je bedrijf correct te koppelen aan onze boekhouding.</p>}
      </div>

      {/* Address */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: 16, margin: "0 0 1rem" }}>Bezorgadres</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Postcode</label>
            <input value={postcode} onChange={e => { setPostcode(e.target.value); setLookupStatus("idle"); }} style={inp} placeholder="2514 CE" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Huisnummer</label>
            <input value={huisnummer} onChange={e => { setHuisnummer(e.target.value); setLookupStatus("idle"); }} style={inp} placeholder="69" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Toev.</label>
            <input value={huisletter} onChange={e => { setHuisletter(e.target.value); setLookupStatus("idle"); }} style={inp} placeholder="A" />
          </div>
        </div>
        <button
          type="button"
          onClick={doLookup}
          disabled={lookupStatus === "looking" || !postcode.trim() || !huisnummer.trim()}
          className="btn-secondary"
          style={{ fontSize: 12, padding: "7px 14px", marginBottom: 12 }}
        >
          {lookupStatus === "looking" ? "Zoeken..." : "Zoek adres"}
        </button>

        {lookupStatus === "found" && (
          <div style={{ padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
            <span style={{ color: "var(--success)", marginRight: 8 }}>✓</span>
            {foundStraat}, {postcode.toUpperCase()} {foundStad}
          </div>
        )}
        {lookupStatus === "fail" && (
          <p style={{ color: "var(--danger)", fontSize: 13 }}>Adres niet gevonden. Controleer postcode en huisnummer.</p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={saveProfile} disabled={saving || !kvk.trim()} className="btn-primary" style={{ fontSize: 13 }}>
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "var(--success)" }}>Opgeslagen</span>}
      </div>
    </div>
  );
}
