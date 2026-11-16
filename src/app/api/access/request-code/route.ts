import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnalysis } from "@/lib/store";
import { getAccessForEmail } from "@/lib/access/reportAccess";
import { requestAccessCode } from "@/lib/access/session";
import { maskEmail } from "@/lib/access/maskEmail";

// Sends a verification code to the email of a report, so its owner can use
// the subscription / lifetime rights tied to that email (lib/access/session.ts).
// Keyed by the report id (its link is the existing access token), never by a
// typed email: codes only ever go to the report's own address, and only when
// that address has rights to use.

const bodySchema = z.object({ analysisId: z.string().uuid() });
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400, headers: NO_STORE });

  const analysis = await getAnalysis(parsed.data.analysisId);
  if (!analysis?.email) return NextResponse.json({ ok: false, error: "Rapport introuvable." }, { status: 404, headers: NO_STORE });

  const access = await getAccessForEmail(analysis.email);
  if (!access.needsVerification) {
    // Nothing to unlock with a code (no rights, or already verified).
    return NextResponse.json({ ok: true, alreadyVerified: access.verified }, { headers: NO_STORE });
  }

  const result = await requestAccessCode(analysis.email);
  if (!result.ok) {
    const error =
      result.reason === "rate_limited"
        ? "Trop de codes demandés. Réessaie dans une heure."
        : "L'e-mail n'a pas pu être envoyé. Réessaie dans quelques instants.";
    return NextResponse.json({ ok: false, error }, { status: result.reason === "rate_limited" ? 429 : 502, headers: NO_STORE });
  }
  return NextResponse.json(
    { ok: true, sentTo: maskEmail(access.email ?? analysis.email), ...(result.devCode ? { devCode: result.devCode } : {}) },
    { headers: NO_STORE }
  );
}
