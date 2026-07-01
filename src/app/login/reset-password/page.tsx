"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { bakeryConfig } from "@/config/bakery.config";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const inp: React.CSSProperties = {
    border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px",
    fontSize: 15, background: "var(--surface)", width: "100%", color: "var(--text)",
  };

  async function submit() {
    setError("");
    if (password.length < 8) { setError("Wachtwoord moet minimaal 8 tekens bevatten."); return; }
    if (password !== confirm) { setError("Wachtwoorden komen niet overeen."); return; }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Er is een fout opgetreden."); return; }
    setDone(true);
    setTimeout(() => router.push("/login"), 2500);
  }

  if (!token) {
    return (
      <p style={{ fontSize: 14, color: "var(--danger)", textAlign: "center" }}>
        Ongeldige resetlink. <Link href="/login/forgot-password" style={{ color: "var(--accent)" }}>Vraag een nieuwe aan.</Link>
      </p>
    );
  }

  return done ? (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 14, color: "var(--success)", margin: 0, fontWeight: 600 }}>
        Wachtwoord succesvol gewijzigd.
      </p>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>U wordt doorgestuurd naar de inlogpagina…</p>
    </div>
  ) : (
    <>
      <div>
        <label style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          Nieuw wachtwoord
        </label>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="minimaal 8 tekens" style={inp} autoFocus
        />
      </div>
      <div>
        <label style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          Herhaal wachtwoord
        </label>
        <input
          type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="••••••••" style={inp}
        />
      </div>
      {error && (
        <p style={{ color: "var(--danger)", background: "var(--danger-bg)", padding: "9px 12px", borderRadius: 8, fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}
      <button
        onClick={submit} disabled={loading || !password || !confirm}
        className="btn-primary"
        style={{ fontSize: 15, padding: "11px", opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "Opslaan…" : "Wachtwoord opslaan"}
      </button>
    </>
  );
}

export default function ResetPasswordPage() {
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
            Nieuw wachtwoord instellen
          </p>
        </div>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
        <Link href="/login" style={{ fontSize: 13, color: "var(--text-subtle)", textAlign: "center" }}>
          Terug naar inloggen
        </Link>
      </div>
    </div>
  );
}
