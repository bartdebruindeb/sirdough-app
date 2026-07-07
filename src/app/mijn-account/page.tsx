"use client";
import { useEffect, useState } from "react";
import { AddLocationModal } from "@/components/AddLocationModal";

const inp: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px",
  fontSize: 14, background: "var(--surface)", width: "100%", color: "var(--text)",
};
const label: React.CSSProperties = {
  fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5,
};

// Uses structured fq filters (exact match on postcode + huisnummer) instead of a
// free-text q= query — free-text search is fuzzy and can match a nearby postcode
// when there's no exact hit for the given house number (same fix as klanten/page.tsx).
async function pdokLookup(postcode: string, huisnummer: string, huisletter: string) {
  // A network/CSP failure here must resolve to null (-> "fail" state), never throw --
  // an uncaught rejection would leave the Toevoegen/Opslaan button stuck on "..." forever.
  try {
    const pc = postcode.replace(/\s/g, "").toUpperCase();
    const params = new URLSearchParams({ q: "*", fq: "type:adres", fl: "straatnaam,woonplaatsnaam,centroide_ll", rows: "1" });
    params.append("fq", `postcode:${pc}`);
    params.append("fq", `huisnummer:${huisnummer}`);
    if (huisletter) params.append("fq", `huisletter:${huisletter}`);
    const res = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data.response?.docs?.[0];
    if (!doc) return null;
    return { straat: doc.straatnaam as string, stad: doc.woonplaatsnaam as string };
  } catch {
    return null;
  }
}

function parseHuisnr(addr: string) {
  const m = addr.match(/(\d+)\s*([a-zA-Z]?)$/);
  return { huisnummer: m?.[1] ?? "", huisletter: m?.[2] ?? "" };
}

type LocationT = {
  id: string; name: string; city: string | null; address: string | null; postalCode: string | null;
  kvk: string | null; phone: string | null; email: string | null;
};

// Small address-lookup form shared wherever a postcode + huisnummer resolves to a street/city.
function AddressLookupFields({ postcode, setPostcode, huisnummer, setHuisnummer, huisletter, setHuisletter, lookupStatus, setLookupStatus, foundStraat, foundStad, onLookup }: {
  postcode: string; setPostcode: (v: string) => void;
  huisnummer: string; setHuisnummer: (v: string) => void;
  huisletter: string; setHuisletter: (v: string) => void;
  lookupStatus: "idle" | "looking" | "found" | "fail"; setLookupStatus: (v: "idle" | "looking" | "found" | "fail") => void;
  foundStraat: string; foundStad: string;
  onLookup: () => void;
}) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={label}>Postcode</label>
          <input value={postcode} onChange={e => { setPostcode(e.target.value); setLookupStatus("idle"); }} style={inp} placeholder="2514 CE" />
        </div>
        <div>
          <label style={label}>Huisnummer</label>
          <input value={huisnummer} onChange={e => { setHuisnummer(e.target.value); setLookupStatus("idle"); }} style={inp} placeholder="69" />
        </div>
        <div>
          <label style={label}>Toev.</label>
          <input value={huisletter} onChange={e => { setHuisletter(e.target.value); setLookupStatus("idle"); }} style={inp} placeholder="A" />
        </div>
      </div>
      <button type="button" onClick={onLookup} disabled={lookupStatus === "looking" || !postcode.trim() || !huisnummer.trim()}
        className="btn-secondary" style={{ fontSize: 12, padding: "6px 12px", marginBottom: 10 }}>
        {lookupStatus === "looking" ? "Zoeken..." : "Zoek adres"}
      </button>
      {lookupStatus === "found" && (
        <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, marginBottom: 4 }}>
          <span style={{ color: "var(--success)", marginRight: 8 }}>✓</span>{foundStraat}, {postcode.toUpperCase()} {foundStad}
        </div>
      )}
      {lookupStatus === "fail" && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>Adres niet gevonden. Controleer postcode en huisnummer.</p>}
    </div>
  );
}

// Read view + editable form for a location's own profile (name, e-mail, KvK, address,
// phone). Every location has its own KvK and invoices.
function LocationCard({ location, onChanged }: { location: LocationT; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]   = useState(location.name);
  const [email, setEmail] = useState(location.email ?? "");
  const [phone, setPhone] = useState(location.phone ?? "");
  const [kvk, setKvk]     = useState(location.kvk ?? "");
  const [postcode, setPostcode]     = useState(location.postalCode ?? "");
  const { huisnummer: hn0, huisletter: hl0 } = parseHuisnr(location.address ?? "");
  const [huisnummer, setHuisnummer] = useState(hn0);
  const [huisletter, setHuisletter] = useState(hl0);
  const [foundStraat, setFoundStraat] = useState(location.address ?? "");
  const [foundStad, setFoundStad]     = useState(location.city ?? "");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "looking" | "found" | "fail">(location.address ? "found" : "idle");
  const [saving, setSaving] = useState(false);

  async function doLookup() {
    if (!postcode.trim() || !huisnummer.trim()) return;
    setLookupStatus("looking");
    const result = await pdokLookup(postcode, huisnummer, huisletter);
    if (result) { setFoundStraat(`${result.straat} ${huisnummer}${huisletter}`.trim()); setFoundStad(result.stad); setLookupStatus("found"); }
    else setLookupStatus("fail");
  }
  async function save() {
    setSaving(true);
    await fetch("/api/mijn/locations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: location.id, name, phone, kvk, email,
        ...(lookupStatus === "found" && { address: foundStraat, postalCode: postcode.toUpperCase(), city: foundStad }),
      }),
    });
    setSaving(false); setEditing(false); onChanged();
  }

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
      {!editing ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{location.name}</h2>
              <p style={{ fontSize: 13, color: "var(--text-subtle)", margin: "0 0 2px" }}>
                {location.address ? `${location.address}, ${location.postalCode} ${location.city}` : "Geen adres ingesteld"}
              </p>
              <p style={{ fontSize: 13, color: "var(--text-subtle)", margin: "0 0 2px" }}>
                {location.email ?? "—"} {location.phone && `· ${location.phone}`}
              </p>
              <p style={{ fontSize: 13, color: location.kvk ? "var(--text-subtle)" : "#f97316", margin: 0 }}>
                KvK: {location.kvk ?? "niet ingevuld"}
              </p>
            </div>
            <button onClick={() => setEditing(true)} className="btn-secondary" style={{ fontSize: 12, flexShrink: 0 }}>Wijzigen</button>
          </div>
          {!location.kvk && <p style={{ fontSize: 12, color: "#f97316", marginTop: 10, marginBottom: 0 }}>⚠ Vul het KvK-nummer in — dit koppelt deze locatie correct aan de facturatie.</p>}
        </>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Naam</label>
              <input value={name} onChange={e => setName(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={label}>E-mailadres</label>
              <input value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="naam@bedrijf.nl" />
            </div>
            <div>
              <label style={label}>Telefoonnummer</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="+31 6 ..." />
            </div>
            <div>
              <label style={label}>KvK-nummer *</label>
              <input value={kvk} onChange={e => setKvk(e.target.value)} style={inp} placeholder="12345678" />
            </div>
          </div>
          <AddressLookupFields postcode={postcode} setPostcode={setPostcode} huisnummer={huisnummer} setHuisnummer={setHuisnummer}
            huisletter={huisletter} setHuisletter={setHuisletter} lookupStatus={lookupStatus} setLookupStatus={setLookupStatus}
            foundStraat={foundStraat} foundStad={foundStad} onLookup={doLookup} />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={() => setEditing(false)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleer</button>
            <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>{saving ? "Opslaan..." : "Opslaan"}</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function MijnAccountPage() {
  const [locations, setLocations] = useState<LocationT[]>([]);
  const [canAdd, setCanAdd]       = useState(false);
  const [addOpen, setAddOpen]     = useState(false);
  const [loading, setLoading]     = useState(true);

  function load() {
    fetch("/api/mijn/locations").then(r => r.json()).then(d => {
      setLocations(d.locations ?? []);
      setCanAdd(!!d.canAdd);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Mijn account</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Elke locatie hieronder heeft haar eigen KvK-nummer en eigen facturen.
        </p>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)" }}>Laden...</p>}

      {!loading && locations.map(loc => <LocationCard key={loc.id} location={loc} onChanged={load} />)}

      {canAdd && (
        <button onClick={() => setAddOpen(true)} className="btn-primary" style={{ fontSize: 13, alignSelf: "flex-start" }}>
          ＋ Locatie toevoegen
        </button>
      )}

      {addOpen && <AddLocationModal onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); load(); }} />}
    </div>
  );
}
