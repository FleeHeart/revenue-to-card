import { normalizeSupabaseUrl, supabaseHeaders, supabaseRequest } from "./supabaseHttp.js";

const REGISTRY_ID = "weekly-report";

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  return request.body;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { endpoint: `${normalizeSupabaseUrl(url)}/rest/v1/workout_service_registry`, key };
}

function isAllowedTunnelUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "trycloudflare.com" || url.hostname.endsWith(".trycloudflare.com"));
  } catch {
    return false;
  }
}

async function getServiceConfig() {
  const apiKey = process.env.WORKOUT_SHARED_KEY || process.env.WORKOUT_API_KEY;
  const configuredUrl = process.env.WORKOUT_SERVICE_URL;
  if (configuredUrl) return { serviceUrl: configuredUrl.replace(/\/$/, ""), apiKey };

  const supabase = getSupabaseConfig();
  if (!supabase) return { serviceUrl: "", apiKey };

  const registry = await supabaseRequest(`${supabase.endpoint}?id=eq.${REGISTRY_ID}&select=service_url&limit=1`, {
    headers: supabaseHeaders(supabase.key, ""),
  });
  if (!registry.ok) return { serviceUrl: "", apiKey };

  const rows = await registry.json();
  const serviceUrl = Array.isArray(rows) ? rows[0]?.service_url : "";
  return { serviceUrl: isAllowedTunnelUrl(serviceUrl) ? serviceUrl.replace(/\/$/, "") : "", apiKey };
}

async function requestWorkOut(path, { method = "GET", body } = {}) {
  const { serviceUrl, apiKey } = await getServiceConfig();
  if (!apiKey) {
    return { ok: false, status: 500, data: { error: "WORKOUT_SHARED_KEY is not configured" } };
  }
  if (!serviceUrl) {
    return { ok: false, status: 503, data: { error: "WorkOut service is offline" } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const upstream = await fetch(`${serviceUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-workout-api-key": apiKey },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await upstream.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || upstream.statusText };
    }
    return { ok: upstream.ok, status: upstream.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      data: { error: "WorkOut service is unavailable", detail: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(request, response) {
  if (request.method === "OPTIONS") return response.status(204).end();

  if (request.method === "GET") {
    const action = String(request.query?.action || "");
    const jobId = String(request.query?.jobId || "");
    if (action === "health") {
      const result = await requestWorkOut("/health");
      return response.status(result.status).json(result.data);
    }
    if (!/^[a-f0-9]{32}$/.test(jobId)) return response.status(405).json({ error: "Method not allowed" });
    const result = await requestWorkOut(`/weekly-report-jobs/${jobId}`);
    return response.status(result.status).json(result.data);
  }
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

  const body = parseBody(request);
  const ownerName = String(body.ownerName || "").trim();
  const ownerUserKey = String(body.ownerUserKey || "").trim();
  const week = String(body.week || "last").trim();
  if (!ownerName) return response.status(400).json({ error: "ownerName is required" });
  if (week !== "last" && !/^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(week)) {
    return response.status(400).json({ error: "week must be last or YYYY-MM-DD:YYYY-MM-DD" });
  }

  const result = await requestWorkOut("/generate-weekly-report", {
    method: "POST",
    body: { ownerName, ownerUserKey: ownerUserKey || undefined, week, source: "database" },
  });
  return response.status(result.status).json(result.data);
}
