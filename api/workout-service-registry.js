import crypto from "node:crypto";
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

function equalSecrets(received, expected) {
  const left = Buffer.from(received || "");
  const right = Buffer.from(expected || "");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAllowedTunnelUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "trycloudflare.com" || url.hostname.endsWith(".trycloudflare.com"));
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

  const registryKey = process.env.WORKOUT_REGISTRY_KEY;
  if (!registryKey) return response.status(500).json({ error: "WORKOUT_REGISTRY_KEY is not configured" });
  if (!equalSecrets(request.headers["x-workout-registry-key"], registryKey)) return response.status(401).json({ error: "Unauthorized" });

  const body = parseBody(request);
  const serviceUrl = String(body.serviceUrl || "").trim().replace(/\/$/, "");
  if (!isAllowedTunnelUrl(serviceUrl)) return response.status(400).json({ error: "serviceUrl must be an HTTPS trycloudflare.com URL" });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return response.status(500).json({ error: "Supabase service role is not configured" });

  const endpoint = `${normalizeSupabaseUrl(supabaseUrl)}/rest/v1/workout_service_registry?on_conflict=id`;
  const upstream = await supabaseRequest(endpoint, {
    method: "POST",
    headers: { ...supabaseHeaders(serviceKey), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { id: REGISTRY_ID, service_url: serviceUrl, updated_at: new Date().toISOString() },
  });
  if (!upstream.ok) return response.status(upstream.status).json({ error: "Registry update failed", detail: await upstream.text() });
  return response.status(204).end();
}
