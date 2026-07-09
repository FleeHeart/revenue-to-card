import https from "node:https";

export function normalizeSupabaseUrl(url) {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

export function supabaseHeaders(key, prefer = "return=representation") {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export function supabaseRequest(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body);

    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        family: 4,
        timeout: 15000,
        headers: {
          ...headers,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (upstream) => {
        let data = "";
        upstream.setEncoding("utf8");
        upstream.on("data", (chunk) => {
          data += chunk;
        });
        upstream.on("end", () => {
          resolve({
            ok: upstream.statusCode >= 200 && upstream.statusCode < 300,
            status: upstream.statusCode,
            statusText: upstream.statusMessage,
            text: async () => data,
            json: async () => (data ? JSON.parse(data) : null),
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Supabase request timed out: ${target.hostname}`));
    });
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}
