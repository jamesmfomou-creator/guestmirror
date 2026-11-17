// Browser-side memory of what this browser may change, and of answers not
// yet attached to an analysis. Per-browser conveniences only: every read and
// write is guarded, and an empty or blocked storage simply means "this
// browser holds no edit token" (the server then requires a verified email).
//
//  - edit tokens: handed out by /api/analyze and /api/analyze/status to the
//    browser that created an analysis (lib/analysisEditToken.ts).
//  - pending answers: goal/profile answered while the analysis runs, kept
//    per attempt so a reload or a closed tab does not lose them before they
//    reach the stored analysis.

import type { Goal, PropertyCountRange, UserType } from "@/lib/types";
import { EDIT_TOKEN_HEADER_NAME } from "@/lib/analysisEditTokenHeader";

const TOKENS_KEY = "gm_edit_tokens";
const ANSWERS_KEY = "gm_pending_answers";
const MAX_TOKENS = 40;
const ANSWERS_TTL_MS = 24 * 60 * 60 * 1000;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: nothing to remember
  }
}

export function rememberEditToken(analysisId: string | undefined | null, token: string | undefined | null) {
  if (typeof window === "undefined" || !analysisId || typeof token !== "string") return;
  const map = read<Record<string, string>>(TOKENS_KEY) ?? {};
  delete map[analysisId];
  map[analysisId] = token;
  const entries = Object.entries(map).slice(-MAX_TOKENS);
  write(TOKENS_KEY, Object.fromEntries(entries));
}

export function editTokenFor(analysisId: string): string | null {
  if (typeof window === "undefined") return null;
  const token = read<Record<string, string>>(TOKENS_KEY)?.[analysisId];
  return typeof token === "string" ? token : null;
}

export interface PendingAnswers {
  goal?: Goal | null;
  user_type?: UserType | null;
  property_count_range?: PropertyCountRange | null;
  savedAtMs: number;
}

export function savePendingAnswers(attemptId: string | null, answers: Omit<PendingAnswers, "savedAtMs">) {
  if (typeof window === "undefined" || !attemptId) return;
  const now = Date.now();
  const all = read<Record<string, PendingAnswers>>(ANSWERS_KEY) ?? {};
  for (const [k, v] of Object.entries(all)) if (!v || now - v.savedAtMs > ANSWERS_TTL_MS) delete all[k];
  all[attemptId] = { ...all[attemptId], ...answers, savedAtMs: now };
  write(ANSWERS_KEY, all);
}

export function takePendingAnswers(attemptId: string | null): PendingAnswers | null {
  if (typeof window === "undefined" || !attemptId) return null;
  const all = read<Record<string, PendingAnswers>>(ANSWERS_KEY);
  return all?.[attemptId] ?? null;
}

export function clearPendingAnswers(attemptId: string | null) {
  if (typeof window === "undefined" || !attemptId) return;
  const all = read<Record<string, PendingAnswers>>(ANSWERS_KEY);
  if (!all || !(attemptId in all)) return;
  delete all[attemptId];
  write(ANSWERS_KEY, all);
}

/**
 * PATCH /api/analyses/[id] with this browser's edit token (if any). Resolves
 * to whether the server accepted it; never throws. Bounded so a slow network
 * never holds the visitor back from their result.
 */
export async function saveAnalysisAnswers(
  analysisId: string,
  answers: { goal?: Goal | null; user_type?: UserType | null; property_count_range?: PropertyCountRange | null },
  timeoutMs = 5000
): Promise<boolean> {
  // Only these three fields, whatever object is passed (e.g. stored pending
  // answers, which also carry savedAtMs): the route accepts nothing else.
  const body = Object.fromEntries(
    (["goal", "user_type", "property_count_range"] as const)
      .map((k) => [k, answers[k]] as const)
      .filter(([, v]) => v !== undefined && v !== null)
  );
  if (Object.keys(body).length === 0) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = editTokenFor(analysisId);
    const res = await fetch(`/api/analyses/${analysisId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { [EDIT_TOKEN_HEADER_NAME]: token } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
