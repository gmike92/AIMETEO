"use client";
// Recensioni utenti — nel pannello di anteprima itinerario sulla mappa
// (MapView.js). Nessun account: un nome libero per recensione (come
// WaitlistSignup, stesso principio "form pubblico, niente login"), salvato
// in localStorage solo per non farlo riscrivere ogni volta sullo stesso
// browser — non è un profilo, è un'autocompilazione.
//
// Stati onesti, come il resto del prodotto: "nessuna recensione ancora" non
// "0 recensioni" sbrigativo, un errore di rete si dichiara invece di
// sparire in silenzio, il voto medio è assente (non 0) finché non c'è
// almeno una recensione.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "./WxIcon";

const AUTHOR_KEY = "zt-review-author-v1";

function Stars({ value, onChange, size = 15 }) {
  const interactive = typeof onChange === "function";
  return (
    <span
      className="stars"
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? "Voto" : `${value} su 5 stelle`}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        interactive ? (
          <button
            key={n}
            type="button"
            className="starbtn"
            aria-pressed={n <= value}
            aria-label={`${n} stelle`}
            onClick={() => onChange(n)}
          >
            <Icon.Star size={size} fill={n <= value} />
          </button>
        ) : (
          <Icon.Star key={n} size={size} fill={n <= value} />
        )
      )}
    </span>
  );
}

export default function RouteReviews({ slug }) {
  const [state, setState] = useState({ status: "loading", data: null });
  const [form, setForm] = useState({ author_name: "", rating: 0, text: "" });
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AUTHOR_KEY);
      if (saved) setForm((f) => ({ ...f, author_name: saved }));
    } catch {
      // storage negato (modalità privata) — il campo resta vuoto, non un errore
    }
  }, []);

  useEffect(() => {
    let dead = false;
    setState({ status: "loading", data: null });
    api
      .getReviews(slug)
      .then((data) => { if (!dead) setState({ status: "ok", data }); })
      .catch(() => { if (!dead) setState({ status: "error", data: null }); });
    return () => { dead = true; };
  }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    const author = form.author_name.trim();
    const text = form.text.trim();
    if (!author || !form.rating || !text) {
      setError("Nome, voto e testo sono tutti obbligatori.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await api.postReview(slug, { author_name: author, rating: form.rating, text });
      try { window.localStorage.setItem(AUTHOR_KEY, author); } catch {}
      const data = await api.getReviews(slug);
      setState({ status: "ok", data });
      setForm({ author_name: author, rating: 0, text: "" });
    } catch {
      setError("Invio non riuscito. Riprova.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="route-reviews">
      <div className="route-reviews-head">
        <span className="dockhead">Recensioni</span>
        {state.status === "ok" && state.data.count > 0 && (
          <span className="route-reviews-avg tnum">
            <Stars value={Math.round(state.data.average_rating)} />
            {state.data.average_rating} · {state.data.count}
          </span>
        )}
      </div>

      {state.status === "loading" && <p className="note">Carico le recensioni…</p>}
      {state.status === "error" && <p className="note">Recensioni non disponibili al momento.</p>}
      {state.status === "ok" && state.data.count === 0 && (
        <p className="note">Nessuna recensione ancora — scrivi la prima.</p>
      )}
      {state.status === "ok" && state.data.count > 0 && (
        <div className="route-reviews-list">
          {state.data.reviews.map((r) => (
            <div className="route-review" key={r.id}>
              <div className="route-review-head">
                <strong>{r.author_name}</strong>
                <Stars value={r.rating} />
              </div>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      )}

      <form className="route-review-form" onSubmit={submit}>
        <Stars value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} size={17} />
        <input
          value={form.author_name}
          onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
          placeholder="Il tuo nome"
          maxLength={60}
          aria-label="Il tuo nome"
        />
        <textarea
          value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          placeholder="Com'è andata?"
          rows={2}
          maxLength={1000}
          aria-label="Testo della recensione"
        />
        {error && <p className="err">{error}</p>}
        <button type="submit" className="btn ghost" disabled={posting}>
          {posting ? "Invio…" : "Pubblica recensione"}
        </button>
      </form>
    </div>
  );
}
