"use client";
import { useSession } from "next-auth/react";
import { bakeryConfig } from "@/config/bakery.config";
import Link from "next/link";

// Public privacy policy (no auth) — referenced from the login page, the customer portal,
// and the account-activation consent checkbox, and usable as the privacy URL for the
// Exact Online app registration. Covers the five points Exact/AVG require: which data,
// how collected, purpose, retention/deletion, and how to withdraw consent / request removal.
//
// The bakery's identity (name, address, contact e-mail) is shown ONLY to logged-in
// customers. A non-logged-in visitor sees a generic version that never names the bakery,
// so the platform can't be traced back to this specific bakkerij by a non-customer.
export default function PrivacyPage() {
  const { status } = useSession();
  const loggedIn = status === "authenticated";

  const h2: React.CSSProperties = { fontSize: 18, margin: "28px 0 8px" };
  const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, color: "var(--text)", margin: "0 0 8px" };
  const li: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, marginBottom: 4 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "2.5rem 1.25rem" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "2.5rem" }}>
        <h1 style={{ fontSize: 28, margin: "0 0 4px" }}>Privacybeleid</h1>
        <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: 0 }}>Laatst bijgewerkt: 11 juli 2026</p>

        <h2 style={h2}>1. Over dit beleid</h2>
        <p style={p}>
          {bakeryConfig.productName} is een platform voor bakkerijen om bestellingen, bezorging en
          facturatie te beheren. Dit beleid beschrijft hoe uw persoonsgegevens worden verwerkt wanneer
          u als klant een account gebruikt. De verwerkingsverantwoordelijke is de bakkerij waarvan u
          klant bent; {bakeryConfig.productName} verwerkt de gegevens uitsluitend namens die bakkerij.
        </p>

        <h2 style={h2}>2. Welke gegevens wij verwerken</h2>
        <ul style={{ paddingLeft: 20, margin: "0 0 8px" }}>
          <li style={li}>Naam en contactgegevens: e-mailadres, telefoonnummer en bezorg-/afhaaladres;</li>
          <li style={li}>KvK-nummer (voor zakelijke klanten, ten behoeve van facturatie);</li>
          <li style={li}>Bestelgegevens (producten, aantallen, bezorgdagen en opmerkingen);</li>
          <li style={li}>Factuurgegevens die nodig zijn voor facturatie;</li>
          <li style={li}>Accountgegevens: uw e-mailadres als inlognaam en uw wachtwoord (uitsluitend versleuteld/gehasht opgeslagen).</li>
        </ul>

        <h2 style={h2}>3. Hoe wij gegevens verzamelen</h2>
        <p style={p}>
          Wij verwerken gegevens die u zelf invoert bij het activeren van uw account of het plaatsen of
          wijzigen van een bestelling, en gegevens die de bakkerij invoert om uw bestellingen en
          facturen te verwerken. Adressen worden geocodeerd via de openbare adresvoorziening (PDOK) om
          de bezorging te plannen.
        </p>

        <h2 style={h2}>4. Waarvoor wij uw gegevens gebruiken</h2>
        <ul style={{ paddingLeft: 20, margin: "0 0 8px" }}>
          <li style={li}>Het verwerken en bezorgen van uw bestellingen;</li>
          <li style={li}>Het opstellen en versturen van facturen;</li>
          <li style={li}>Communicatie over uw bestelling: een bezorgherinnering, een pakbon en uw factuur;</li>
          <li style={li}>Het beheren van uw account en inloggen.</li>
        </ul>

        <h2 style={h2}>5. Delen met derden</h2>
        <p style={p}>Wij delen uw gegevens uitsluitend met de partijen die nodig zijn om de dienst te leveren:</p>
        <ul style={{ paddingLeft: 20, margin: "0 0 8px" }}>
          <li style={li}><strong>Exact Online</strong> — voor facturatie en boekhouding (naam, e-mailadres, KvK-nummer en factuurgegevens);</li>
          <li style={li}><strong>Resend</strong> — voor het versturen van e-mails (naam, e-mailadres en bestel-/bezorggegevens);</li>
          <li style={li}><strong>Onze hostingprovider</strong> — voor opslag en verwerking van gegevens in een datacenter binnen de EU.</li>
        </ul>
        <p style={p}>Wij verkopen uw gegevens nooit en gebruiken ze niet voor advertenties.</p>

        <h2 style={h2}>6. Bewaartermijnen en verwijdering</h2>
        <p style={p}>
          Wij bewaren uw gegevens zolang u een actieve klant bent. Factuur- en administratiegegevens
          worden bewaard gedurende de wettelijke fiscale bewaartermijn van 7 jaar. Daarna, of eerder op
          uw verzoek (voor zover er geen wettelijke bewaarplicht geldt), worden uw persoonsgegevens
          verwijderd.
        </p>

        <h2 style={h2}>7. Beveiliging</h2>
        <p style={p}>
          Alle verbindingen verlopen uitsluitend over een versleutelde HTTPS/TLS-verbinding. Wachtwoorden
          worden gehasht opgeslagen, de toegang is beveiligd met authenticatie en rolgebaseerde
          autorisatie, en de gegevens van elke bakkerij staan in een gescheiden database.
        </p>

        <h2 style={h2}>8. Uw rechten en het intrekken van toestemming</h2>
        <p style={p}>
          U hebt het recht op inzage, correctie en verwijdering van uw persoonsgegevens, en op
          overdraagbaarheid van uw gegevens. U kunt uw toestemming voor de verwerking op elk moment
          intrekken en een verzoek tot verwijdering indienen. Wij reageren binnen de wettelijke termijn
          en verwijderen uw gegevens, tenzij een wettelijke bewaarplicht dit tijdelijk in de weg staat.
        </p>

        <h2 style={h2}>9. Contact</h2>
        {loggedIn ? (
          <p style={p}>
            U bent klant van <strong>{bakeryConfig.businessName}</strong>. Voor vragen over dit beleid of
            een verzoek met betrekking tot uw gegevens kunt u contact opnemen via{" "}
            <a href={`mailto:${bakeryConfig.contactEmail}`} style={{ color: "var(--accent)" }}>{bakeryConfig.contactEmail}</a>.
          </p>
        ) : (
          <p style={p}>
            Voor vragen over dit beleid of een verzoek met betrekking tot uw gegevens kunt u contact
            opnemen met de bakkerij waarvan u klant bent, via de contactgegevens die u bij uw bestelling
            of account hebt ontvangen.
          </p>
        )}

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Link href="/login" style={{ fontSize: 13, color: "var(--accent)" }}>← Terug naar inloggen</Link>
        </div>
      </div>
    </div>
  );
}
