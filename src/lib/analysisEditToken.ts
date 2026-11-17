import { createHmac, timingSafeEqual } from "node:crypto";
import { serverSecret } from "@/lib/serverSecret";

// Proof that a browser may modify an analysis (goal, profile, optional
// listing details) or delete it. Before this, the analysis id alone was
// enough -- and the id is in the report link, which is shared by email.
//
// The token is an HMAC of the analysis id with a server secret: nothing is
// stored, no migration. It is handed only to the browser that created the
// analysis (the /api/analyze response, the status endpoint answering for
// that browser's own random attempt id). Another device can still act on a
// report once its email is verified (lib/access/session.ts), checked by
// mayEditAnalysis in the route.
//
// Secret: lib/serverSecret.ts (ANALYSIS_EDIT_SECRET when set, otherwise
// derived from the Supabase service-role key, server-only). Rotating that key invalidates
// outstanding tokens: the owner then simply can no longer change the goal
// from that browser, nothing else is affected.

export function editTokenFor(analysisId: string): string {
  return createHmac("sha256", serverSecret()).update(`analysis-edit:v1:${analysisId}`).digest("base64url").slice(0, 32);
}

export function isValidEditToken(analysisId: string, token: unknown): boolean {
  if (typeof token !== "string" || token.length !== 32) return false;
  const expected = Buffer.from(editTokenFor(analysisId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export { EDIT_TOKEN_HEADER_NAME as EDIT_TOKEN_HEADER } from "@/lib/analysisEditTokenHeader";
