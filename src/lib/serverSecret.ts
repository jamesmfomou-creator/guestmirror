import { createHash, createHmac } from "node:crypto";

// Server-only secrets for HMACs: analysis edit tokens (lib/analysisEditToken.ts)
// and the hashed identifiers counted by the abuse limit (lib/analyzeRateLimit.ts).
//
// Source, in order:
//   1. ANALYSIS_EDIT_SECRET -- the dedicated secret (recommended, set in Vercel).
//   2. Derived from SUPABASE_SERVICE_ROLE_KEY -- transition fallback only, so a
//      deploy made before the dedicated secret exists still works.
//
// Transition (no token is ever invalidated by surprise):
//   - Tokens are always ISSUED with the current secret (1 if set, else 2).
//   - Tokens are ACCEPTED if they match the current secret, or the derived one
//     while ANALYSIS_EDIT_ACCEPT_DERIVED is not "false". So setting
//     ANALYSIS_EDIT_SECRET later keeps every token already handed out valid.
//   - Once the dedicated secret has been live longer than you care about old
//     tokens, set ANALYSIS_EDIT_ACCEPT_DERIVED=false: only (1) remains.
//
// Production without any secret fails CLOSED: no token is issued or accepted
// (owners can still act after verifying their email). The local-demo constant
// is never used in production.

const MIN_SECRET_LENGTH = 32;

function derivedFromServiceKey(): string | null {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return service ? createHash("sha256").update(`guestmirror-analysis-edit:${service}`).digest("hex") : null;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export interface EditSecrets {
  /** Signs new tokens and hashes; null = misconfigured production (fail closed). */
  current: string | null;
  /** Every secret a presented token may match. */
  accepted: string[];
  source: "dedicated" | "derived" | "local_demo" | "none";
}

let warned = false;

export function editSecrets(): EditSecrets {
  const dedicated = process.env.ANALYSIS_EDIT_SECRET?.trim() || null;
  const derived = derivedFromServiceKey();
  const acceptDerived = process.env.ANALYSIS_EDIT_ACCEPT_DERIVED !== "false";

  if (dedicated && dedicated.length < MIN_SECRET_LENGTH && !warned) {
    warned = true;
    console.error(`[secret] ANALYSIS_EDIT_SECRET is shorter than ${MIN_SECRET_LENGTH} characters: use a long random value`);
  }
  if (dedicated) {
    return { current: dedicated, accepted: [dedicated, ...(derived && acceptDerived ? [derived] : [])], source: "dedicated" };
  }
  if (derived) {
    if (isProduction() && !warned) {
      warned = true;
      console.warn("[secret] ANALYSIS_EDIT_SECRET is not set: edit tokens use the transition secret derived from the service key");
    }
    return { current: derived, accepted: [derived], source: "derived" };
  }
  if (isProduction()) return { current: null, accepted: [], source: "none" };
  // Local demo without Supabase only (file storage on this machine).
  const local = "guestmirror-local-demo-only";
  return { current: local, accepted: [local], source: "local_demo" };
}

/** @deprecated kept for callers that need one value; prefer editSecrets(). */
export function serverSecret(): string | null {
  return editSecrets().current;
}

/** Keyed, non-reversible identifier (never the raw IP or email in storage). null if no secret. */
export function hashIdentifier(kind: "ip" | "email", value: string): string | null {
  const secret = editSecrets().current;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("base64url").slice(0, 22);
}
