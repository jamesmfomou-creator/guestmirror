/**
 * Client-side visitor identity for funnel tracking. No fingerprinting: a
 * random id stored in localStorage, nothing derived from the device.
 */

const ANON_ID_KEY = "gm_aid";
const SESSION_ID_KEY = "gm_sid";
const SESSION_LAST_ACTIVE_KEY = "gm_sid_active";
const FIRST_TOUCH_KEY = "gm_first_touch";
const LAST_TOUCH_KEY = "gm_last_touch";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min of inactivity -> new session

export interface Attribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  captured_at: string;
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode, quota) -- tracking degrades silently
  }
}

export function getAnonymousId(): string {
  if (typeof window === "undefined") return "server";
  let id = safeGet(ANON_ID_KEY);
  if (!id) {
    id = genId();
    safeSet(ANON_ID_KEY, id);
  }
  return id;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  const now = Date.now();
  const lastActive = Number(safeGet(SESSION_LAST_ACTIVE_KEY) || 0);
  let id = safeGet(SESSION_ID_KEY);
  if (!id || now - lastActive > SESSION_IDLE_TIMEOUT_MS) {
    id = genId();
    safeSet(SESSION_ID_KEY, id);
  }
  safeSet(SESSION_LAST_ACTIVE_KEY, String(now));
  return id;
}

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/**
 * Reads UTM params from the current URL (if any) and persists first-touch
 * (set once, never overwritten) and last-touch (overwritten whenever a new
 * UTM-tagged URL is visited) attribution in localStorage. Safe to call on
 * every page load -- it's a no-op when the URL has no UTM params.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const hasUtm = UTM_PARAMS.some((p) => params.get(p));
  if (!hasUtm) return;

  const attribution: Attribution = {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    content: params.get("utm_content"),
    term: params.get("utm_term"),
    captured_at: new Date().toISOString(),
  };

  safeSet(LAST_TOUCH_KEY, JSON.stringify(attribution));
  if (!safeGet(FIRST_TOUCH_KEY)) {
    safeSet(FIRST_TOUCH_KEY, JSON.stringify(attribution));
  }
}

function readAttribution(key: string): Attribution | null {
  const raw = safeGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

export function getFirstTouch(): Attribution | null {
  if (typeof window === "undefined") return null;
  return readAttribution(FIRST_TOUCH_KEY);
}

export function getLastTouch(): Attribution | null {
  if (typeof window === "undefined") return null;
  return readAttribution(LAST_TOUCH_KEY);
}
