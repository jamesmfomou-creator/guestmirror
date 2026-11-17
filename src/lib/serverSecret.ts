import { createHash, createHmac } from "node:crypto";

// Server-only secret for HMACs (analysis edit tokens, hashed identifiers in
// rate-limit events). ANALYSIS_EDIT_SECRET when set, otherwise derived from
// the Supabase service-role key, so production needs no new variable.
export function serverSecret(): string {
  const explicit = process.env.ANALYSIS_EDIT_SECRET;
  if (explicit) return explicit;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (service) return createHash("sha256").update(`guestmirror-analysis-edit:${service}`).digest("hex");
  // Local demo without Supabase only (file storage on this machine).
  return "guestmirror-local-demo-only";
}

/** Keyed, non-reversible identifier (never the raw IP or email in storage). */
export function hashIdentifier(kind: "ip" | "email", value: string): string {
  return createHmac("sha256", serverSecret()).update(`${kind}:${value}`).digest("base64url").slice(0, 22);
}
