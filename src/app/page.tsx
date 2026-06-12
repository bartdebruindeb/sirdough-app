import Link from "next/link";

export default function HomePage() {
  const today = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 860 }}>
      <p style={{ color: "var(--text-subtle)", fontSize: 13, margin: "0 0 6px" }}>{today}</p>
      <h1 style={{ fontSize: 34, marginBottom: "0.25rem" }}>Goedemorgen</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2.5rem" }}>Wat gaan we vandaag bakken?</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: "3rem" }}>
        {[
          { href: "/productie",    title: "Productie",    desc: "Dagelijks productieoverzicht + deeg calculator", color: "#fde68a" },
          { href: "/recepten",     title: "Recepten",     desc: "Bakkers percentages per broodsoort",             color: "#d1fae5" },
          { href: "/bestellingen", title: "Bestellingen", desc: "Vaste en eenmalige bestellingen invoeren",       color: "#dbeafe" },
          { href: "/bezorgen",     title: "Bezorgen",     desc: "Bezorglijst per klant afvinken",                 color: "#ede9fe" },
          { href: "/facturatie",   title: "Facturatie",   desc: "Overzicht per klant over een periode",           color: "#fce7f3" },
        ].map(({ href, title, desc, color }) => (
          <Link key={href} href={href} style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
            padding: "1.25rem", textDecoration: "none", color: "inherit", display: "block",
          }} className="dash-card">
            <div style={{ width: 36, height: 36, background: color, borderRadius: 8, marginBottom: 12 }} />
            <p style={{ fontFamily: "var(--font-display)", fontSize: 17, margin: "0 0 5px" }}>{title}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>{desc}</p>
          </Link>
        ))}
      </div>

      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem" }}>
        <h3 style={{ fontSize: 15, marginBottom: "1rem", color: "var(--text-muted)" }}>Opstarten checklist</h3>
        {[
          "Check in productie of aantallen voor morgen kloppen",
          "Voer eenmalige bestellingen in vanuit WhatsApp",
          "Vink vaste bestellingen aan/uit die (non-)actief zijn",
          "Stel productiedatum (morgen) en bezorgdatum (vandaag) in",
          "Controleer aantallen in productie met recepten sheet",
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ width: 18, height: 18, border: "2px solid var(--border-strong)", borderRadius: 4, flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{item}</span>
          </div>
        ))}
      </div>

      <style>{`
        .dash-card:hover { box-shadow: 0 4px 16px rgba(28,16,9,0.08); transform: translateY(-2px); transition: all 0.15s; }
      `}</style>
    </div>
  );
}
