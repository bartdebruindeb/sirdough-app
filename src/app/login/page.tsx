"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bakeryConfig } from "@/config/bakery.config";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true); setError("");
    const result = await signIn("credentials", {
      email, password, redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("E-mailadres of wachtwoord onjuist.");
    } else {
      router.push("/");
      router.refresh();
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
        borderRadius: 16, padding: "2.5rem", width: "100%", maxWidth: 380,
        display: "flex", flexDirection: "column", gap: 18,
      }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: "0 0 4px" }}>
            Welcome to {bakeryConfig.productName}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Log in met uw account
          </p>
        </div>

        <div>
          <label style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            E-mailadres
          </label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="naam@bedrijf.nl" style={inp} autoFocus
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Wachtwoord
          </label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="••••••••" style={inp}
          />
        </div>

        {error && (
          <p style={{ color: "var(--danger)", background: "var(--danger-bg)", padding: "9px 12px", borderRadius: 8, fontSize: 13, margin: 0 }}>
            {error}
          </p>
        )}

        <button
          onClick={handleLogin} disabled={loading || !email || !password}
          className="btn-primary"
          style={{ fontSize: 15, padding: "11px", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Inloggen…" : "Inloggen"}
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <Link href="/login/forgot-password" style={{ fontSize: 12, color: "var(--accent)" }}>
            Wachtwoord vergeten?
          </Link>
          <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: 0 }}>
            Geen account? Neem contact op met de bakkerij.
          </p>
          <Link href="/privacy" style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            Privacybeleid
          </Link>
        </div>
      </div>
    </div>
  );
}
