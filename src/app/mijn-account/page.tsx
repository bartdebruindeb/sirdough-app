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

type LocationT = {
  id: string; name: string; city: string | null; address: string | null; postalCode: string | null;
  kvk: string | null; phone: string | null; email: string | null;
};
type AddressT = { id: string; label: string; street: string; postalCode: string; city: string; isDefault: boolean };

// Small address-lookup form shared by the location editor and the delivery-address
// editor — both resolve postcode + huisnummer to a street/city via PDOK the same way.
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

// One delivery address under a location, with its own view/Wijzigen toggle.
function AddressRow({ address, customerId, onChanged }: { address: AddressT; customerId: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [labelVal, setLabelVal] = useState(address.label);
  const [postcode, setPostcode] = useState(address.postalCode);
  const { huisnummer: hn0, huisletter: hl0 } = parseHuisnr(address.street);
  const [huisnummer, setHuisnummer] = useState(hn0);
  const [huisletter, setHuisletter] = useState(hl0);
  const [foundStraat, setFoundStraat] = useState(address.street);
  const [foundStad, setFoundStad] = useState(address.city);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "looking" | "found" | "fail">("found");
  const [isDefault, setIsDefault] = useState(address.isDefault);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Returns the resolved street/city, doing the PDOK lookup first if it hasn't
  // succeeded yet — so clicking "Opslaan" always does something instead of silently
  // sitting there disabled when someone forgot to click "Zoek adres" first (or the
  // postcode/huisnummer they'd already looked up got edited afterwards).
  async function resolveAddress(): Promise<{ straat: string; stad: string } | null> {
    if (lookupStatus === "found" && postcode.trim() && huisnummer.trim()) return { straat: foundStraat, stad: foundStad };
    if (!postcode.trim() || !huisnummer.trim()) { setLookupStatus("fail"); return null; }
    setLookupStatus("looking");
    const result = await pdokLookup(postcode, huisnummer, huisletter);
    if (!result) { setLookupStatus("fail"); return null; }
    const straat = `${result.straat} ${huisnummer}${huisletter}`.trim();
    setFoundStraat(straat); setFoundStad(result.stad); setLookupStatus("found");
    return { straat, stad: result.stad };
  }
  async function doLookup() { await resolveAddress(); }

  async function save() {
    setSaveError("");
    const resolved = await resolveAddress();
    if (!resolved) { setSaveError("Adres niet gevonden. Controleer postcode en huisnummer."); return; }
    setSaving(true);
    const res = await fetch(`/api/mijn/adressen?id=${address.id}&customerId=${customerId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: labelVal, street: resolved.straat, postalCode: postcode.toUpperCase(), city: resolved.stad, isDefault }),
    });
    setSaving(false);
    if (res.ok) { setEditing(false); onChanged(); }
    else setSaveError("Opslaan mislukt. Probeer het opnieuw.");
  }
  async function remove() {
    if (!confirm(`Adres "${address.label}" verwijderen?`)) return;
    await fetch(`/api/mijn/adressen?id=${address.id}&customerId=${customerId}`, { method: "DELETE" });
    onChanged();
  }

  if (!editing) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{address.label}</span>
          {address.isDefault && <span style={{ fontSize: 10, background: "var(--accent-light)", color: "var(--accent)", padding: "1px 6px", borderRadius: 6, marginLeft: 6 }}>standaard</span>}
          <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "2px 0 0" }}>{address.street}, {address.postalCode} {address.city}</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setEditing(true)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 9px" }}>Wijzigen</button>
          <button onClick={remove} style={{ fontSize: 11, padding: "4px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--danger)", cursor: "pointer" }}>Verwijder</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--accent)", marginBottom: 6, background: "var(--surface-2)" }}>
      <label style={label}>Naam (bijv. "Filiaal centrum")</label>
      <input value={labelVal} onChange={e => setLabelVal(e.target.value)} style={{ ...inp, marginBottom: 8 }} />
      <AddressLookupFields postcode={postcode} setPostcode={setPostcode} huisnummer={huisnummer} setHuisnummer={setHuisnummer}
        huisletter={huisletter} setHuisletter={setHuisletter} lookupStatus={lookupStatus} setLookupStatus={setLookupStatus}
        foundStraat={foundStraat} foundStad={foundStad} onLookup={doLookup} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 10 }}>
        <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} /> Standaard bezorgadres
      </label>
      {saveError && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 8px" }}>{saveError}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setEditing(false)} className="btn-secondary" style={{ fontSize: 12 }}>Annuleer</button>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 12 }}>{saving ? "Opslaan..." : "Opslaan"}</button>
      </div>
    </div>
  );
}

function NewAddressForm({ customerId, onAdded, onCancel }: { customerId: string; onAdded: () => void; onCancel: () => void }) {
  const [labelVal, setLabelVal] = useState("");
  const [postcode, setPostcode] = useState("");
  const [huisnummer, setHuisnummer] = useState("");
  const [huisletter, setHuisletter] = useState("");
  const [foundStraat, setFoundStraat] = useState("");
  const [foundStad, setFoundStad] = useState("");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "looking" | "found" | "fail">("idle");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Same as AddressRow.resolveAddress: run the lookup if it hasn't succeeded yet, so
  // "Toevoegen" always does something rather than sitting disabled and silent.
  async function resolveAddress(): Promise<{ straat: string; stad: string } | null> {
    if (lookupStatus === "found" && postcode.trim() && huisnummer.trim()) return { straat: foundStraat, stad: foundStad };
    if (!postcode.trim() || !huisnummer.trim()) { setLookupStatus("fail"); return null; }
    setLookupStatus("looking");
    const result = await pdokLookup(postcode, huisnummer, huisletter);
    if (!result) { setLookupStatus("fail"); return null; }
    const straat = `${result.straat} ${huisnummer}${huisletter}`.trim();
    setFoundStraat(straat); setFoundStad(result.stad); setLookupStatus("found");
    return { straat, stad: result.stad };
  }
  async function doLookup() { await resolveAddress(); }

  async function save() {
    setSaveError("");
    const resolved = await resolveAddress();
    if (!resolved) { setSaveError("Adres niet gevonden. Controleer postcode en huisnummer."); return; }
    setSaving(true);
    const res = await fetch(`/api/mijn/adressen?customerId=${customerId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: labelVal || "Locatie", street: resolved.straat, postalCode: postcode.toUpperCase(), city: resolved.stad, isDefault: false }),
    });
    setSaving(false);
    if (res.ok) onAdded();
    else setSaveError("Toevoegen mislukt. Probeer het opnieuw.");
  }

  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--accent)", marginBottom: 6, background: "var(--surface-2)" }}>
      <label style={label}>Naam (bijv. "Filiaal centrum")</label>
      <input value={labelVal} onChange={e => setLabelVal(e.target.value)} style={{ ...inp, marginBottom: 8 }} placeholder="Locatie" />
      <AddressLookupFields postcode={postcode} setPostcode={setPostcode} huisnummer={huisnummer} setHuisnummer={setHuisnummer}
        huisletter={huisletter} setHuisletter={setHuisletter} lookupStatus={lookupStatus} setLookupStatus={setLookupStatus}
        foundStraat={foundStraat} foundStad={foundStad} onLookup={doLookup} />
      {saveError && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 8px" }}>{saveError}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} className="btn-secondary" style={{ fontSize: 12 }}>Annuleer</button>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 12 }}>{saving ? "Toevoegen..." : "Toevoegen"}</button>
      </div>
    </div>
  );
}

// Read view + editable form for a location's own profile (name, KvK, address, phone).
// Every location has its own KvK and invoices — this is the "separate legal entity"
// nuance. Multiple delivery ADDRESSES under the same KvK are handled below it instead.
function LocationCard({ location, onChanged }: { location: LocationT; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]   = useState(location.name);
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

  const [addresses, setAddresses] = useState<AddressT[]>([]);
  const [addingAddress, setAddingAddress] = useState(false);

  function loadAddresses() {
    fetch(`/api/mijn/adressen?customerId=${location.id}`).then(r => r.json()).then(d => setAddresses(d.addresses ?? [])).catch(() => {});
  }
  useEffect(() => { loadAddresses(); }, [location.id]);

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
        id: location.id, name, phone, kvk,
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
              <label style={label}>Telefoonnummer</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="+31 6 ..." />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
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

      {/* Bezorgadressen: multiple delivery addresses under this SAME KvK/invoice —
          e.g. several branches billed together, as opposed to a separate location
          card above (which has its own KvK and its own invoices). */}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 14 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", margin: "0 0 4px" }}>Bezorgadressen</h3>
        <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "0 0 10px" }}>
          Meerdere afleveradressen die samen op één factuur (dit KvK-nummer) komen.
        </p>
        {addresses.map(a => <AddressRow key={a.id} address={a} customerId={location.id} onChanged={loadAddresses} />)}
        {addresses.length === 0 && !addingAddress && (
          <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "0 0 8px" }}>Nog geen extra bezorgadressen.</p>
        )}
        {addingAddress
          ? <NewAddressForm customerId={location.id} onAdded={() => { setAddingAddress(false); loadAddresses(); }} onCancel={() => setAddingAddress(false)} />
          : <button onClick={() => setAddingAddress(true)} className="btn-secondary" style={{ fontSize: 12 }}>+ Adres toevoegen</button>}
      </div>
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
          Elke locatie hieronder heeft haar eigen KvK-nummer en eigen facturen. Heb je in
          plaats daarvan meerdere afleveradressen die samen op ÉÉN factuur mogen komen? Voeg
          die dan toe als "Bezorgadres" binnen een locatie, hieronder.
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
