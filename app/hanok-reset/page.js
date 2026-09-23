"use client";

import { useEffect, useMemo, useState } from "react";

const SB_URL = "https://lludyxgivnmmkovhhrgg.supabase.co";
const SB_KEY = "sb_publishable_YCeXPfqOdVS84ZRis-miEg_v7W0s3Dg";

function parseRecovery() {
  if (typeof window === "undefined") return {};
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return {
    accessToken: hash.get("access_token") || query.get("access_token") || "",
    refreshToken: hash.get("refresh_token") || query.get("refresh_token") || "",
    type: hash.get("type") || query.get("type") || "",
    error: hash.get("error_description") || query.get("error_description") || "",
  };
}

export default function HanokResetPage() {
  const [recovery, setRecovery] = useState({});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setRecovery(parseRecovery());
  }, []);

  const validRecovery = useMemo(
    () => Boolean(recovery.accessToken) && (!recovery.type || recovery.type === "recovery"),
    [recovery]
  );

  async function updatePassword(e) {
    e.preventDefault();
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setStatus("The two passwords do not match.");
      return;
    }
    if (!validRecovery) {
      setStatus("This recovery link is invalid or has expired. Request a new reset email from 报告老板.");
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(SB_URL + "/auth/v1/user", {
        method: "PUT",
        headers: {
          apikey: SB_KEY,
          Authorization: "Bearer " + recovery.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.msg || data?.message || data?.error_description || "Password update failed.");
      setDone(true);
      setStatus("Password updated successfully. You can return to 报告老板 and sign in with your new password.");
      if (typeof window !== "undefined") window.history.replaceState({}, "", "/hanok-reset");
    } catch (err) {
      setStatus(err?.message || "Password update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(160deg,#061827,#0d2b41)", color: "#fff", display: "grid", placeItems: "center", padding: 22, fontFamily: "Inter,Arial,sans-serif" }}>
      <section style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 40, fontWeight: 700 }}>报告老板</div>
        <div style={{ color: "#9fb0bd", fontSize: 11, letterSpacing: ".12em", marginTop: 4 }}>PASSWORD RECOVERY</div>
        <div style={{ marginTop: 26, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 22, padding: 20 }}>
          <h1 style={{ margin: 0, fontSize: 23 }}>Set a new password</h1>
          <p style={{ color: "#aab7c0", fontSize: 13, lineHeight: 1.55 }}>
            Choose a new password for your 报告老板 account.
          </p>

          {recovery.error ? (
            <div style={{ color: "#ff9aa6", fontSize: 13, lineHeight: 1.5 }}>{recovery.error}</div>
          ) : !validRecovery && !done ? (
            <div style={{ color: "#f0cb85", fontSize: 13, lineHeight: 1.5 }}>
              This recovery link is missing or expired. Open 报告老板 and request a new password reset email.
            </div>
          ) : null}

          {!done && validRecovery ? (
            <form onSubmit={updatePassword}>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", marginTop: 12, padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.07)", color: "#fff", outline: "none" }}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", marginTop: 10, padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.07)", color: "#fff", outline: "none" }}
              />
              <button
                disabled={busy}
                type="submit"
                style={{ width: "100%", marginTop: 16, padding: 14, border: 0, borderRadius: 12, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg,#cba967,#8f6835)", cursor: "pointer", opacity: busy ? .7 : 1 }}
              >
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          ) : null}

          {status ? (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(255,255,255,.06)", color: done ? "#a7e3bf" : "#ffb3bc", fontSize: 13, lineHeight: 1.5 }}>
              {status}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
