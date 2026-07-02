"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function UitnodigingPage() {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "var(--text-subtle)" }}>Laden…</div>}>
      <UitnodigingContent />
    </Suspense>
  );
}

function UitnodigingContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [status, setStatus]     = useState<"loading"|"valid"|"invalid"|"done">("loading");
  const [message, setMessage]   = useState("");
  const [email, setEmail]       = useState("");
  const [hadEmail, setHadEmail] = useState(false); // true = email was already known, no need to ask for it
  const [name, setName]         = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!token) { setStatus("invalid"); setMessage("Geen uitnodigingstoken gevonden."); return; }
    fetch(`/api/invite?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.valid) {
          setStatus("valid");
          setEmail(d.email ?? "");
          setHadEmail(!!d.email);
          setName(d.name ?? "");
        } else {
          setStatus("invalid");
          setMessage(d.message ?? "Ongeldige link.");
        }
      })
      .catch(() => {
        setStatus("invalid");
        setMessage("Kon de uitnodiging niet laden. Controleer je verbinding en probeer opnieuw.");
      });
  }, [token]);

  async function setWachtwoord() {
    if (!hadEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Vul een geldig e-mailadres in."); return; }
    if (password.length < 8) { setError("Minimaal 8 tekens."); return; }
    if (password !== password2) { setError("Wachtwoorden komen niet overeen."); return; }
    setSaving(true); setError("");

    const res = await fetch("/api/invite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, email: hadEmail ? undefined : email.trim().toLowerCase() }),
    });
    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      setStatus("done");
      const result = await signIn("credentials", { email: data.email, password, redirect: false });
      setTimeout(() => router.push(result?.ok ? "/mijn-bestellingen" : "/login"), 1500);
    } else {
      setError(data.message ?? "Er is iets misgegaan.");
    }
  }

  const inp: React.CSSProperties = {
    border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px",
    fontSize: 15, background: "var(--surface)", width: "100%", color: "var(--text)",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: 24,
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "2.5rem", width: "100%", maxWidth: 400,
        display: "flex", flexDirection: "column", gap: 18,
      }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "0 0 4px" }}>Digital Bakery</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Uitnodiging activeren</p>
        </div>

        {status === "loading" && (
          <p style={{ color: "var(--text-subtle)", textAlign: "center" }}>Laden…</p>
        )}

        {status === "invalid" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 32, margin: "0 0 8px" }}>⚠️</p>
            <p style={{ color: "var(--danger)", fontWeight: 500 }}>{message}</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Neem contact op met de bakkerij voor een nieuwe uitnodiging.
            </p>
          </div>
        )}

        {status === "done" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 40, margin: "0 0 8px" }}>🎉</p>
            <p style={{ fontWeight: 600, fontSize: 16 }}>Account geactiveerd!</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>U wordt doorgestuurd…</p>
          </div>
        )}

        {status === "valid" && (
          <>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
              Welkom{name ? `, ${name}` : ""}! {!hadEmail
                ? "Vul uw e-mailadres in en kies een wachtwoord om uw account te activeren."
                : `Kies een wachtwoord voor uw account (${email}).`}
            </p>
            {!hadEmail && (
              <div>
                <label style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                  E-mailadres (wordt uw inlognaam)
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="naam@voorbeeld.nl" autoFocus />
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Nieuw wachtwoord
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inp} placeholder="Minimaal 8 tekens" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Wachtwoord herhalen
              </label>
              <input
                type="password" value={password2} onChange={e => setPassword2(e.target.value)}
                onKeyDown={e => e.key === "Enter" && setWachtwoord()}
                style={inp} placeholder="Herhaal wachtwoord"
              />
            </div>
            {error && (
              <p style={{ color: "var(--danger)", background: "var(--danger-bg)", padding: "9px 12px", borderRadius: 8, fontSize: 13, margin: 0 }}>
                {error}
              </p>
            )}
            <button onClick={setWachtwoord} disabled={saving} className="btn-primary" style={{ fontSize: 15, padding: 11 }}>
              {saving ? "Activeren…" : "Account activeren"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
