"use client";
import { useState } from "react";
import Link from "next/link";
import { bakeryConfig } from "@/config/bakery.config";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const inp: React.CSSProperties = {
    border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px",
    fontSize: 15, background: "var(--surface)", width: "100%", color: "var(--text)",
  };

  async function submit() {
    if (!email) return;
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setDone(true);
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: 24,
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "2.5rem", width: "100%", maxWidth: 380,
        display: "flex", flexDirection: "column", gap: 18,
      }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: "0 0 4px" }}>
            {bakeryConfig.productName}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Wachtwoord vergeten
          </p>
        </div>

        {done ? (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 14, color: "var(--text)", margin: 0 }}>
              Als er een account bestaat voor <strong>{email}</strong>, ontvangt u binnen enkele minuten een e-mail met een resetlink.
            </p>
            <Link href="/login" style={{ fontSize: 13, color: "var(--accent)" }}>
              Terug naar inloggen
            </Link>
          </div>
        ) : (
          <>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                E-mailadres
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="naam@bedrijf.nl" style={inp} autoFocus
              />
            </div>

            <button
              onClick={submit} disabled={loading || !email}
              className="btn-primary"
              style={{ fontSize: 15, padding: "11px", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Versturen…" : "Resetlink versturen"}
            </button>

            <Link href="/login" style={{ fontSize: 13, color: "var(--text-subtle)", textAlign: "center" }}>
              Terug naar inloggen
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
