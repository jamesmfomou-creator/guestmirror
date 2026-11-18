import { createHmac, timingSafeEqual } from "node:crypto";
import { editSecrets } from "@/lib/serverSecret";

// Proof that a browser may modify an analysis (goal, profile, optional
// listing details) or delete it. Before this, the analysis id alone was
// enough -- and the id is in the report link, which is shared by email.
//
// The token is an HMAC of the analysis id with a server secret: nothing is
// stored, no migration. It is handed only to the browser that created the
// analysis (the /api/analyze response, the status endpoint answering for
// that browser's own random attempt id). Any other browser -- another device,
// or an old report created before tokens existed -- proves ownership by
// verifying the report's email with a code (lib/access/session.ts), checked
// by mayEdit in api/analyses/[id].
//
// Secrets and their rotation: lib/serverSecret.ts.

function sign(secret: string, analysisId: string): string {
  return createHmac("sha256", secret).update(`analysis-edit:v1:${analysisId}`).digest("base64url").slice(0, 32);
}

/** The token for this analysis, or null when no secret is configured (production fails closed). */
export function editTokenFor(analysisId: string): string | null {
  const { current } = editSecrets();
  return current ? sign(current, analysisId) : null;
}

export function isValidEditToken(analysisId: string, token: unknown): boolean {
  if (typeof token !== "string" || token.length !== 32) return false;
  const given = Buffer.from(token);
  return editSecrets().accepted.some((secret) => {
    const expected = Buffer.from(sign(secret, analysisId));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

export { EDIT_TOKEN_HEADER_NAME as EDIT_TOKEN_HEADER } from "@/lib/analysisEditTokenHeader";
