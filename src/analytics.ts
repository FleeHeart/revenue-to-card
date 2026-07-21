type AnalyticsEventName =
  | "page_view"
  | "field_drawer_opened"
  | "field_search"
  | "field_view"
  | "platform_selected"
  | "calculation_ready"
  | "workout_report_generated";

type AnalyticsPayload = Record<string, string | number | boolean | string[] | number[] | null | undefined>;

function getSessionId() {
  const key = "revenue_to_card_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const nextId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, nextId);
  return nextId;
}

export async function trackEvent(eventName: AnalyticsEventName, payload: AnalyticsPayload = {}) {
  if (typeof window === "undefined") return;

  const event = {
    event_name: eventName,
    session_id: getSessionId(),
    page_url: window.location.href,
    user_agent: window.navigator.userAgent,
    payload,
  };

  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Analytics should never interrupt the tool experience.
  }
}
