// Thin client for the Zerotermico backend. Base URL is configurable per environment.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function req(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  return res.json();
}

// Server-side fetch helper for React Server Components: uses Next's ISR cache
// (revalidate) so route pages are rendered at build/request time for SEO.
export async function serverFetch(path, { revalidate = 300 } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`API ${res.status} ${path}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  health: () => req("/healthz"),
  listRoutes: (activity) =>
    req(`/routes${activity ? `?activity=${encodeURIComponent(activity)}` : ""}`),
  getRoute: (slug) => req(`/routes/${encodeURIComponent(slug)}`),
  forecastPoint: (lat, lon) => req(`/forecast/point?lat=${lat}&lon=${lon}`),
  briefing: (routeId, locale = "it") =>
    req("/briefing", {
      method: "POST",
      body: JSON.stringify({ route_id: routeId, locale }),
    }),
  plan: (payload) =>
    req("/planner/plan", { method: "POST", body: JSON.stringify(payload) }),
  postWaitlist: (email, source = "frontend", locale = "it") =>
    req("/waitlist", {
      method: "POST",
      body: JSON.stringify({ email, source, locale }),
    }),
};
