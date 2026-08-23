"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "./WxIcon";

// Small waitlist signup form (client component). Posts to POST /waitlist
// with source: "frontend"; backend returns 200 {status:"ok"} or 422 on
// invalid email.
export default function WaitlistSignup({ source = "frontend" }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | "loading" | "ok" | "err"

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      await api.postWaitlist(email.trim(), source);
      setStatus("ok");
      setEmail("");
    } catch {
      setStatus("err");
    }
  };

  return (
    <div className="panel">
      <strong>Avvisami al lancio</strong>
      <p className="note">Niente spam. Solo l'avviso quando apriamo, in anteprima.</p>
      <form
        onSubmit={submit}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}
      >
        <input
          type="email"
          required
          aria-label="Email"
          placeholder="La tua email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button className="btn" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Invio…" : "Entra in lista"}
        </button>
      </form>
      {status === "ok" && (
        <p className="note" role="status"
          style={{ color: "var(--accent2)", display: "flex", alignItems: "center", gap: 7 }}>
          <Icon.Check size={14} /> Sei in lista!
        </p>
      )}
      {status === "err" && (
        <p className="err" role="alert">
          Email non valida o servizio non disponibile. Riprova.
        </p>
      )}
    </div>
  );
}
