"use client";
import { useRole } from "@/lib/role-context";
import { useEffect, useState } from "react";


type User = { id: string; email: string; active: boolean } | null;
type DeliveryAddress = { id: string; label: string; street: string; postalCode: string; city: string; isDefault: boolean };
type Customer = {
  id: string; name: string; city: string | null; address: string | null;
  postalCode: string | null;
  email: string | null; phone: string | null; notes: string | null;
  kvk: string | null;
  preferredBread: string | null;
  lat: number | null; lng: number | null;
  active: boolean; userId: string | null; user: User;
  discountPercent: number;
  customerNumber: number | null;
  exactCustomerCode: string | null;
  deliveryAddresses: DeliveryAddress[];
};

const inp: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px",
  fontSize: 13, background: "var(--surface)", width: "100%",
};

// Parse housenumber + letter from the end of a Dutch address string
function parseHuisnr(addr: string): { huisnummer: string; huisletter: string } {
  const m = addr.match(/(\d+)\s*([a-zA-Z]?)$/);
  return m ? { huisnummer: m[1], huisletter: m[2] } : { huisnummer: "", huisletter: "" };
}

// PDOK — official Dutch address lookup (returns street, city, lat, lng).
// Uses structured fq filters (exact match on postcode + huisnummer) instead of a
// free-text q= query — free-text search is fuzzy and can match a nearby postcode
// when there's no exact hit for the given house number.
async function pdokLookup(postcode: string, huisnummer: string, huisletter: string): Promise<{ straat: string; stad: string; lat: number; lng: number } | null> {
  const pc = postcode.replace(/\s/g, "").toUpperCase();
  const params = new URLSearchParams({
    q: "*",
    fq: "type:adres",
    fl: "straatnaam,woonplaatsnaam,centroide_ll",
    rows: "1",
  });
  params.append("fq", `postcode:${pc}`);
  params.append("fq", `huisnummer:${huisnummer}`);
  if (huisletter) params.append("fq", `huisletter:${huisletter}`);
  const res = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?${params}`);
  const data = await res.json();
  const doc = data.response?.docs?.[0];
  if (!doc?.straatnaam) return null;
  const m = doc.centroide_ll?.match(/POINT\(([^ ]+) ([^ ]+)\)/);
  if (!m) return null;
  return { straat: doc.straatnaam, stad: doc.woonplaatsnaam ?? "", lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
}

const NOM = "https://nominatim.openstreetmap.org/search";
const NOM_HEADERS = { "Accept-Language": "nl", "User-Agent": "SirdoughApp/1.0" };

async function nominatim(params: Record<string, string>): Promise<{ lat: number; lng: number } | null> {
  const qs = new URLSearchParams({ ...params, format: "json", limit: "1", countrycodes: "nl" }).toString();
  const r = await fetch(`${NOM}?${qs}`, { headers: NOM_HEADERS });
  const d = await r.json();
  if (!d[0]) return null;
  return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
}

// Tries structured queries first (most reliable), falls back to free-text.
async function geocodeAddress(address: string, postalCode: string, city: string): Promise<{ lat: number; lng: number } | null> {
  // 1. Structured: postalcode + street (most precise for Dutch addresses)
  if (postalCode) {
    const r = await nominatim({ street: address, postalcode: postalCode.replace(/\s/g, "") });
    if (r) return r;
  }
  // 2. Structured: street + city
  if (city) {
    const r = await nominatim({ street: address, city });
    if (r) return r;
  }
  // 3. Free-text with postalcode
  if (postalCode) {
    const r = await nominatim({ q: `${address}, ${postalCode}` });
    if (r) return r;
  }
  // 4. Free-text with city
  if (city) {
    const r = await nominatim({ q: `${address}, ${city}, Nederland` });
    if (r) return r;
  }
  // 5. Address alone
  return nominatim({ q: `${address}, Nederland` });
}

function CustomerForm({ initial, onSave, onCancel }: {
  initial?: Partial<Customer>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName]             = useState(initial?.name ?? "");
  const [email, setEmail]           = useState(initial?.email ?? "");
  const [phone, setPhone]           = useState(initial?.phone ?? "");
  const [kvk, setKvk]               = useState(initial?.kvk ?? "");
  const [notes, setNotes]           = useState(initial?.notes ?? "");
  const [preferredBread, setPreferredBread] = useState(initial?.preferredBread ?? "");

  // Address lookup via PDOK
  const initHuisnr = parseHuisnr(initial?.address ?? "");
  const [postcode, setPostcode]       = useState(initial?.postalCode ?? "");
  const [huisnummer, setHuisnummer]   = useState(initHuisnr.huisnummer);
  const [huisletter, setHuisletter]   = useState(initHuisnr.huisletter);
  const [foundStraat, setFoundStraat] = useState(initial?.address ?? "");
  const [foundStad, setFoundStad]     = useState(initial?.city ?? "");
  const [foundLat, setFoundLat]       = useState<number|null>(initial?.lat ?? null);
  const [foundLng, setFoundLng]       = useState<number|null>(initial?.lng ?? null);
  const [lookupStatus, setLookupStatus] = useState<"idle"|"looking"|"found"|"fail">(
    initial?.address ? "found" : "idle"
  );
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  async function doLookup() {
    if (!postcode.trim() || !huisnummer.trim()) return;
    setLookupStatus("looking");
    try {
      const result = await pdokLookup(postcode.trim(), huisnummer.trim(), huisletter.trim());
      if (result) {
        const fullAddress = `${result.straat} ${huisnummer.trim()}${huisletter.trim()}`;
        setFoundStraat(fullAddress);
        setFoundStad(result.stad);
        setFoundLat(result.lat);
        setFoundLng(result.lng);
        setLookupStatus("found");
      } else {
        setFoundStraat(""); setFoundStad(""); setFoundLat(null); setFoundLng(null);
        setLookupStatus("fail");
      }
    } catch {
      setLookupStatus("fail");
    }
  }

  async function submit() {
    if (!name.trim()) { setError("Naam is verplicht."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("E-mailadres is niet geldig (bijv. naam@domein.nl)."); return;
    }
    if (phone && !/^[\d\s+\-().]{6,20}$/.test(phone)) {
      setError("Telefoonnummer bevat ongeldige tekens."); return;
    }
    setSaving(true); setError("");
    try {
      await onSave({
        name: name.trim(),
        city: foundStad || null,
        address: foundStraat || null,
        postalCode: postcode.trim() || null,
        lat: foundLat,
        lng: foundLng,
        email, phone, kvk, notes, preferredBread,
      });
    } catch (e: any) {
      setError(e.message ?? "Opslaan mislukt.");
    }
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Naam *</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="Café Johannes" />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Adres (voor bezorgroute)</label>
        <div style={{ display: "grid", gridTemplateColumns: "110px 80px 60px 1fr", gap: 8, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 10, color: "var(--text-subtle)", display: "block", marginBottom: 3 }}>Postcode</label>
            <input value={postcode} onChange={e=>{setPostcode(e.target.value);setLookupStatus("idle");}} style={inp} placeholder="2611 CG" />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "var(--text-subtle)", display: "block", marginBottom: 3 }}>Huisnr.</label>
            <input value={huisnummer} onChange={e=>{setHuisnummer(e.target.value);setLookupStatus("idle");}} style={inp} placeholder="25" />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "var(--text-subtle)", display: "block", marginBottom: 3 }}>Toev.</label>
            <input value={huisletter} onChange={e=>{setHuisletter(e.target.value);setLookupStatus("idle");}} style={inp} placeholder="a" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="button" onClick={doLookup} disabled={lookupStatus==="looking"||!postcode.trim()||!huisnummer.trim()} className="btn-secondary" style={{ fontSize: 12, padding: "7px 12px", width: "100%" }}>
              {lookupStatus==="looking" ? "Zoeken…" : "🔍 Zoek adres"}
            </button>
          </div>
        </div>
        {lookupStatus==="found" && foundStraat && (
          <p style={{ fontSize: 12, color: "var(--success)", margin: "6px 0 0", fontWeight: 500 }}>✓ {foundStraat}, {foundStad}</p>
        )}
        {lookupStatus==="fail" && (
          <p style={{ fontSize: 12, color: "var(--danger)", margin: "6px 0 0" }}>Adres niet gevonden. Controleer postcode en huisnummer.</p>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>E-mail (voor inloggen)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="contact@cafe.nl" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Telefoon</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="+31 6 12345678" />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>KvK-nummer</label>
        <input value={kvk} onChange={e => setKvk(e.target.value)} style={inp} placeholder="12345678" />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={inp} placeholder="bijv. gesneden, pakbon mee" />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Voorkeur brood</label>
        <input value={preferredBread} onChange={e => setPreferredBread(e.target.value)} style={inp} placeholder="bijv. 1,5kg, sesam & zaden" />
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
        <button onClick={submit} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>
          {saving ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </div>
  );
}

function InviteModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { role } = useRole();
  const [loading, setLoading]   = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied]     = useState(false);
  const [error, setError]       = useState("");

  async function generate() {
    setLoading(true); setError("");
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ customerId: customer.id }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setInviteUrl(data.inviteUrl);
    else setError(data.message ?? "Mislukt.");
  }

  function copy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, padding: "1.75rem", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Uitnodiging sturen</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-subtle)" }}>×</button>
        </div>

        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Genereer een uitnodigingslink voor <strong>{customer.name}</strong>.
          De klant klikt op de link en vult zelf e-mailadres en wachtwoord in.
        </p>

        {!inviteUrl && (
          <>
            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
            <button onClick={generate} disabled={loading} className="btn-primary">
              {loading ? "Genereren…" : "Link genereren"}
            </button>
          </>
        )}

        {inviteUrl && (
          <>
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
              <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "0 0 6px", textTransform: "uppercase" }}>Uitnodigingslink (48 uur geldig)</p>
              <p style={{ fontSize: 12, wordBreak: "break-all", margin: 0, color: "var(--text)" }}>{inviteUrl}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={copy} className="btn-primary" style={{ flex: 1 }}>
                {copied ? "✓ Gekopieerd!" : "📋 Kopieer link"}
              </button>
              {customer.email && (
                <a href={`mailto:${customer.email}?subject=Uitnodiging%20Digital%20Bakery&body=Beste%20${customer.name},%0A%0AKlik%20op%20deze%20link%20om%20uw%20account%20te%20activeren:%0A${encodeURIComponent(inviteUrl)}`}
                  className="btn-secondary" style={{ textDecoration: "none", padding: "9px 14px", fontSize: 13 }}>
                  ✉ Stuur e-mail
                </a>
              )}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: 0 }}>
              Stuur deze link naar {customer.name}. Ze kunnen hem maar één keer gebruiken en vullen zelf hun e-mailadres in.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function KlantenPage() {
  const { role } = useRole();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showNew, setShowNew]     = useState(false);
  const [editing, setEditing]     = useState<string | null>(null);
  const [accountModal, setAccountModal] = useState<Customer | null>(null);
  const [search, setSearch]       = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [sortBy, setSortBy]       = useState<"name"|"city">("name");

  function load() {
    setLoading(true);
    fetch(`/api/customers?sort=${sortBy}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => { setCustomers(d.customers ?? []); setLoading(false); });
  }

  useEffect(() => { load(); }, [sortBy]);

  const [toast, setToast] = useState("");
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500); }

  const [geocodingId, setGeocodingId] = useState<string | null>(null);
  const [geocodingAll, setGeocodingAll] = useState(false);

  async function geocodeSingle(c: Customer): Promise<boolean> {
    if (!c.address) return false;
    const coord = await geocodeAddress(c.address, c.postalCode ?? "", c.city ?? "");
    if (!coord) return false;
    await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ id: c.id, lat: coord.lat, lng: coord.lng }),
    });
    return true;
  }

  async function geocodeAll() {
    const missing = customers.filter(c => c.address && (!c.lat || !c.lng));
    if (missing.length === 0) { showToast("Alle adressen hebben al een locatie."); return; }
    setGeocodingAll(true);
    let ok = 0, fail = 0;
    for (const c of missing) {
      setGeocodingId(c.id);
      try {
        const success = await geocodeSingle(c);
        if (success) ok++; else fail++;
      } catch { fail++; }
      // Nominatim rate limit: max 1 req/sec
      await new Promise(r => setTimeout(r, 1100));
    }
    setGeocodingId(null);
    setGeocodingAll(false);
    showToast(`✓ ${ok} locaties opgeslagen${fail > 0 ? `, ${fail} niet gevonden` : ""}.`);
    load();
  }
  const [deleteModal, setDeleteModal] = useState<{ customer: Customer; needsForce: boolean; orderCount: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function createCustomer(data: any) {
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    setShowNew(false);
    load();
    showToast(`✓ ${data.name} toegevoegd.`);
  }

  async function updateCustomer(id: string, data: any) {
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ id, ...data }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    setEditing(null);
    load();
    showToast(`✓ ${data.name ?? "Klant"} bijgewerkt.`);
  }

  async function startDelete(c: Customer) {
    // Always confirm first — a customer with no orders would otherwise be deleted on
    // a single click. (Customers WITH orders get the stronger force-delete modal below.)
    if (!confirm(`Weet je zeker dat je klant "${c.name}" wilt verwijderen?`)) return;
    const res  = await fetch(`/api/customers?id=${c.id}`, { method: "DELETE", headers: { "x-role": role ?? "" } });
    const data = await res.json();
    if (data.deleted) { showToast(`✓ ${c.name} verwijderd.`); load(); return; }
    if (data.needsConfirm) {
      setDeleteModal({ customer: c, needsForce: true, orderCount: (data.hasOrders ?? 0) + (data.hasRecurring ?? 0) });
    }
  }

  async function confirmForceDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    await fetch(`/api/customers?id=${deleteModal.customer.id}&force=1`, { method: "DELETE", headers: { "x-role": role ?? "" } });
    setDeleting(false);
    setDeleteModal(null);
    showToast(`✓ ${deleteModal.customer.name} verwijderd.`);
    load();
  }

  async function toggleActive(c: Customer) {
    await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ id: c.id, active: !c.active }),
    });
    load();
  }

  const cities = ["all", ...Array.from(new Set(customers.map(c => c.city).filter(Boolean) as string[])).sort()];
  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.city?.toLowerCase().includes(search.toLowerCase());
    const matchCity = cityFilter === "all" || c.city === cityFilter;
    return matchSearch && matchCity;
  });
  const activeCount = filtered.filter(c => c.active).length;

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>Klanten</h1>
          {toast && <p style={{ color: "var(--success)", fontSize: 13, fontWeight: 500, margin: "4px 0 0" }}>{toast}</p>}
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            {activeCount} actief · {filtered.length} totaal
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-secondary"
            onClick={geocodeAll}
            disabled={geocodingAll}
            title="Geocodeer alle klanten zonder opgeslagen locatie"
            style={{ fontSize: 13 }}
          >
            {geocodingAll ? `📍 Bezig… (${customers.filter(c => c.address && (!c.lat || !c.lng)).length} resterend)` : "📍 Alle locaties"}
          </button>
          <button className="btn-primary" onClick={() => setShowNew(true)} style={{ fontSize: 13 }}>
            + Nieuwe klant
          </button>
        </div>
      </div>

      {/* New customer form */}
      {showNew && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: "1rem" }}>Nieuwe klant</h3>
          <CustomerForm onSave={createCustomer} onCancel={() => setShowNew(false)} />
        </div>
      )}

      {/* Search + filter + sort */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Zoek op naam of stad…"
          style={{ ...inp, width: 220 }}
        />
        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} style={{ ...inp, width: 160 }}>
          <option value="all">Alle steden</option>
          {cities.filter(c => c !== "all").map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: "var(--text-subtle)", alignSelf: "center" }}>Sorteren:</span>
          {(["name","city"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)} style={{
              padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, cursor: "pointer",
              background: sortBy === s ? "var(--accent)" : "var(--surface)",
              color: sortBy === s ? "white" : "var(--text-muted)",
            }}>{s === "name" ? "Naam" : "Stad"}</button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)", fontSize: 13 }}>Laden…</p>}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-subtle)" }}>
          Geen klanten gevonden.
        </div>
      )}

      {/* Customer list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(c => (
          <div key={c.id} className="card" style={{ overflow: "hidden", opacity: c.active ? 1 : 0.55 }}>
            {editing === c.id ? (
              <div style={{ padding: "1.25rem 1.5rem" }}>
                <h3 style={{ fontSize: 14, marginBottom: "1rem" }}>Bewerken: {c.name}</h3>
                <CustomerForm
                  initial={c}
                  onSave={data => updateCustomer(c.id, data)}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", flexWrap: "wrap" }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{c.name}</span>
                    {c.city && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{c.city}</span>}
                    {!c.active && <span style={{ fontSize: 11, color: "var(--danger)", background: "var(--danger-bg)", padding: "1px 7px", borderRadius: 10 }}>Inactief</span>}
                  </div>
                  {(() => {
                    // Show a single address: the customer's own default address if they've set
                    // one (more likely to be current), otherwise the owner-entered c.address.
                    const defaultAddr = c.deliveryAddresses?.find(a => a.isDefault);
                    const displayAddress = defaultAddr
                      ? `${defaultAddr.street}, ${defaultAddr.postalCode} ${defaultAddr.city}`
                      : c.address;
                    const extraAddresses = c.deliveryAddresses?.filter(a => !a.isDefault) ?? [];
                    return (
                      <>
                        <div style={{ display: "flex", gap: 12, marginTop: 3, flexWrap: "wrap" }}>
                          {displayAddress && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>📍 {displayAddress}</span>}
                          {c.email && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>✉ {c.email}</span>}
                          {c.phone && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>📞 {c.phone}</span>}
                          {c.notes && <span style={{ fontSize: 11, color: "var(--text-subtle)", fontStyle: "italic" }}>{c.notes}</span>}
                          {c.preferredBread && <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-light)", padding: "1px 7px", borderRadius: 8 }}>🍞 {c.preferredBread}</span>}
                          {c.exactCustomerCode && <span title="Exact Online klantnummer" style={{ fontSize: 11, color: "#1d4ed8", background: "#eff6ff", padding: "1px 7px", borderRadius: 8 }}>Exact #{c.exactCustomerCode}</span>}
                        </div>
                        {extraAddresses.length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            {extraAddresses.map(a => (
                              <span key={a.id} style={{ fontSize: 11, color: "var(--text-subtle)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px" }}>
                                {a.label}: {a.street}, {a.postalCode} {a.city}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Customer number */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 64 }}>
                  <label style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase" }}>Klantnr.</label>
                  <input
                    type="number"
                    value={c.customerNumber ?? ""}
                    placeholder="—"
                    onBlur={async e => {
                      const val = e.target.value === "" ? null : Number(e.target.value);
                      await fetch("/api/customers", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: c.id, customerNumber: val }),
                      });
                      setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, customerNumber: val } : x));
                    }}
                    style={{ fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", padding: "4px 6px", width: 60, textAlign: "center" }}
                  />
                </div>

                {/* Discount selector */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 80 }}>
                  <label style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase" }}>Korting</label>
                  <select
                    value={c.discountPercent}
                    onChange={async e => {
                      const val = Number(e.target.value);
                      await fetch("/api/customers", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: c.id, discountPercent: val }),
                      });
                      setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, discountPercent: val } : x));
                    }}
                    style={{ fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", padding: "4px 6px", cursor: "pointer" }}
                  >
                    {[0, 5, 10, 15, 20].map(v => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </div>

                {/* Account status */}
                <div style={{ fontSize: 12, textAlign: "center", minWidth: 80 }}>
                  {c.user ? (
                    <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}>
                      <span>✓</span> Account actief
                    </span>
                  ) : (
                    <button
                      onClick={() => setAccountModal(c)}
                      style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-light)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                    >
                      ✉ Stuur uitnodiging
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={() => setEditing(c.id)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>
                    Bewerken
                  </button>
                  <button onClick={() => toggleActive(c)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>
                    {c.active ? "Deactiveer" : "Activeer"}
                  </button>
                  <button onClick={() => startDelete(c)} style={{
                    fontSize: 12, padding: "5px 12px", borderRadius: 7,
                    border: "1px solid #fca5a5", background: "none", cursor: "pointer", color: "var(--danger)",
                  }}>
                    Verwijder
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {accountModal && (
        <InviteModal
          customer={accountModal}
          onClose={() => setAccountModal(null)}
        />
      )}

      {deleteModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(28,16,9,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50, padding:24 }}>
          <div style={{ background:"var(--surface)", borderRadius:14, width:"100%", maxWidth:420, padding:"1.75rem", display:"flex", flexDirection:"column", gap:16 }}>
            <h2 style={{ margin:0, fontSize:18 }}>Klant verwijderen</h2>
            <p style={{ fontSize:14, color:"var(--text-muted)", margin:0 }}>
              Weet je zeker dat je <strong>{deleteModal.customer.name}</strong> wilt verwijderen?
            </p>
            {deleteModal.orderCount > 0 && (
              <p style={{ fontSize:13, background:"var(--warn-bg)", padding:"8px 12px", borderRadius:8, margin:0 }}>
                Let op: deze klant heeft <strong>{deleteModal.orderCount}</strong> bestelling(en). Die worden ook verwijderd.
              </p>
            )}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={()=>setDeleteModal(null)} className="btn-secondary" disabled={deleting}>Annuleren</button>
              <button onClick={confirmForceDelete} disabled={deleting}
                style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"var(--danger)", color:"white", cursor:"pointer", fontSize:14, fontFamily:"var(--font-body)" }}>
                {deleting ? "Verwijderen…" : "Ja, verwijderen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
