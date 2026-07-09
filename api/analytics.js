import { normalizeSupabaseUrl, supabaseHeaders, supabaseRequest } from "./supabaseHttp.js";

const allowedEvents = new Set([
  "page_view",
  "field_drawer_opened",
  "field_search",
  "field_view",
  "platform_selected",
  "calculation_ready",
]);

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Analytics environment is not configured", {
      hasUrl: Boolean(supabaseUrl),
      hasKey: Boolean(supabaseKey),
    });
    response.status(500).json({
      error: "Analytics environment is not configured",
      hasUrl: Boolean(supabaseUrl),
      hasKey: Boolean(supabaseKey),
    });
    return;
  }

  const event = request.body;

  if (!event || !allowedEvents.has(event.event_name) || !event.session_id) {
    response.status(400).json({ error: "Invalid analytics event" });
    return;
  }

  const endpoint = `${normalizeSupabaseUrl(supabaseUrl)}/rest/v1/analytics_events`;
  let result;
  try {
    result = await supabaseRequest(endpoint, {
      method: "POST",
      headers: supabaseHeaders(supabaseKey, "return=minimal"),
      body: {
        event_name: event.event_name,
        session_id: String(event.session_id).slice(0, 128),
        page_url: event.page_url ? String(event.page_url).slice(0, 2048) : null,
        user_agent: event.user_agent ? String(event.user_agent).slice(0, 512) : null,
        payload: event.payload && typeof event.payload === "object" ? event.payload : {},
      },
    });
  } catch (error) {
    console.error("Analytics fetch failed", {
      message: error instanceof Error ? error.message : String(error),
      endpointHost: new URL(endpoint).host,
    });
    response.status(502).json({ error: "Analytics upstream request failed" });
    return;
  }

  if (!result.ok) {
    const detail = await result.text();
    console.error("Analytics insert failed", {
      status: result.status,
      detail,
    });
    response.status(result.status).json({ error: "Supabase insert failed", detail });
    return;
  }

  response.status(204).end();
}
