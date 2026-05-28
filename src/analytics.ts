import { createClient } from "@supabase/supabase-js";

type AnalyticsEventName =
  | "page_view"
  | "field_drawer_opened"
  | "field_search"
  | "field_view"
  | "platform_selected"
  | "calculation_ready";

type AnalyticsPayload = Record<string, string | number | boolean | string[] | number[] | null | undefined>;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function getSessionId() {
  const key = "revenue_to_card_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const nextId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, nextId);
  return nextId;
}

export function trackEvent(eventName: AnalyticsEventName, payload: AnalyticsPayload = {}) {
  if (!supabase || typeof window === "undefined") return;

  const event = {
    event_name: eventName,
    session_id: getSessionId(),
    page_url: window.location.href,
    user_agent: window.navigator.userAgent,
    payload,
  };

  window.setTimeout(() => {
    void supabase.from("analytics_events").insert(event);
  }, 0);
}

