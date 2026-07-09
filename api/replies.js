const DELETE_PASSWORD = process.env.REPLY_DELETE_PASSWORD ?? "FuYao";

function normalizeSupabaseUrl(url) {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const privilegedKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  const publicKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseKey = privilegedKey ?? publicKey;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return {
    endpoint: `${normalizeSupabaseUrl(supabaseUrl)}/rest/v1/reply_items`,
    key: supabaseKey,
    hasPrivilegedKey: Boolean(privilegedKey),
  };
}

function supabaseHeaders(key, prefer = "return=representation") {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  };
}

function normalizeReply(input) {
  return {
    question: String(input.question ?? "").trim(),
    answer: String(input.answer ?? "").trim(),
    category: String(input.category ?? "").trim(),
    keywords: Array.isArray(input.keywords)
      ? input.keywords.map((item) => String(item).trim()).filter(Boolean)
      : [],
    scenario: String(input.scenario ?? "").trim(),
    note: String(input.note ?? "").trim(),
    source: input.source === "default" ? "default" : "custom",
  };
}

function validateReply(reply) {
  if (!reply.question || !reply.answer) {
    return "question and answer are required";
  }
  if (reply.question.length > 2000 || reply.answer.length > 8000) {
    return "reply is too long";
  }
  return "";
}

async function readError(upstream) {
  const detail = await upstream.text();
  return detail || upstream.statusText;
}

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

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  const config = getSupabaseConfig();
  if (!config) {
    response.status(500).json({ error: "Supabase environment is not configured" });
    return;
  }

  try {
    if (request.method === "GET") {
      const upstream = await fetch(
        `${config.endpoint}?select=id,question,answer,category,keywords,scenario,note,source,created_at,updated_at&is_active=eq.true&order=source.asc,updated_at.desc`,
        {
          headers: supabaseHeaders(config.key, ""),
        },
      );

      if (!upstream.ok) {
        response.status(upstream.status).json({ error: "Supabase read failed", detail: await readError(upstream) });
        return;
      }

      response.status(200).json(await upstream.json());
      return;
    }

    if (request.method === "POST") {
      if (!config.hasPrivilegedKey) {
        response.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" });
        return;
      }

      const body = parseBody(request);
      const payload = Array.isArray(body.items) ? body.items.map(normalizeReply) : normalizeReply(body);
      const items = Array.isArray(payload) ? payload : [payload];
      const invalid = items.map(validateReply).find(Boolean);
      if (invalid) {
        response.status(400).json({ error: invalid });
        return;
      }

      const upstream = await fetch(config.endpoint, {
        method: "POST",
        headers: supabaseHeaders(config.key),
        body: JSON.stringify(items),
      });

      if (!upstream.ok) {
        response.status(upstream.status).json({ error: "Supabase insert failed", detail: await readError(upstream) });
        return;
      }

      response.status(201).json(await upstream.json());
      return;
    }

    if (request.method === "PUT" || request.method === "PATCH") {
      if (!config.hasPrivilegedKey) {
        response.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" });
        return;
      }

      const body = parseBody(request);
      const id = String(body.id ?? "").trim();
      if (!id) {
        response.status(400).json({ error: "id is required" });
        return;
      }

      const reply = normalizeReply(body);
      const invalid = validateReply(reply);
      if (invalid) {
        response.status(400).json({ error: invalid });
        return;
      }

      const upstream = await fetch(`${config.endpoint}?id=eq.${encodeURIComponent(id)}&source=eq.custom`, {
        method: "PATCH",
        headers: supabaseHeaders(config.key),
        body: JSON.stringify(reply),
      });

      if (!upstream.ok) {
        response.status(upstream.status).json({ error: "Supabase update failed", detail: await readError(upstream) });
        return;
      }

      response.status(200).json(await upstream.json());
      return;
    }

    if (request.method === "DELETE") {
      if (!config.hasPrivilegedKey) {
        response.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" });
        return;
      }

      const body = parseBody(request);
      const id = String(body.id ?? "").trim();
      const password = String(body.password ?? "");

      if (!id) {
        response.status(400).json({ error: "id is required" });
        return;
      }

      if (password !== DELETE_PASSWORD) {
        response.status(403).json({ error: "Invalid delete password" });
        return;
      }

      const upstream = await fetch(`${config.endpoint}?id=eq.${encodeURIComponent(id)}&source=eq.custom`, {
        method: "PATCH",
        headers: supabaseHeaders(config.key),
        body: JSON.stringify({ is_active: false }),
      });

      if (!upstream.ok) {
        response.status(upstream.status).json({ error: "Supabase delete failed", detail: await readError(upstream) });
        return;
      }

      response.status(200).json(await upstream.json());
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(502).json({
      error: "Replies upstream request failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
