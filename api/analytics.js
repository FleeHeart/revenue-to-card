const allowedEvents = new Set([
  "page_view",
  "field_drawer_opened",
  "field_search",
  "field_view",
  "platform_selected",
  "calculation_ready",
]);

function normalizeSupabaseUrl(url) {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    response.status(500).json({ error: "Analytics environment is not configured" });
    return;
  }

  const event = request.body;

  if (!event || !allowedEvents.has(event.event_name) || !event.session_id) {
    response.status(400).json({ error: "Invalid analytics event" });
    return;
  }

  const endpoint = `${normalizeSupabaseUrl(supabaseUrl)}/rest/v1/analytics_events`;
  const result = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      event_name: event.event_name,
      session_id: String(event.session_id).slice(0, 128),
      page_url: event.page_url ? String(event.page_url).slice(0, 2048) : null,
      user_agent: event.user_agent ? String(event.user_agent).slice(0, 512) : null,
      payload: event.payload && typeof event.payload === "object" ? event.payload : {},
    }),
  });

  if (!result.ok) {
    const detail = await result.text();
    response.status(result.status).json({ error: "Supabase insert failed", detail });
    return;
  }

  response.status(204).end();
}

