import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnalysis } from "@/lib/store";
import { getAccessForEmail } from "@/lib/access/reportAccess";
import { consumeCredit } from "@/lib/access/accessStore";

// Unlocks a report with one Conciergerie analysis. The quota is enforced in
// the database (consume_grant_credit locks the grant row), never in the UI;
// a report never costs two credits.

const bodySchema = z.object({ analysisId: z.string().uuid() });
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400, headers: NO_STORE });
  const { analysisId } = parsed.data;

  const analysis = await getAnalysis(analysisId);
  if (!analysis) return NextResponse.json({ ok: false, error: "Rapport introuvable." }, { status: 404, headers: NO_STORE });
  if (analysis.is_unlocked) return NextResponse.json({ ok: true, outcome: "already" }, { headers: NO_STORE });

  const access = await getAccessForEmail(analysis.email);
  if (!access.verified || !access.conciergerie) {
    return NextResponse.json({ ok: false, error: "Vérifie d'abord ton e-mail." }, { status: 403, headers: NO_STORE });
  }
  const res = await consumeCredit(access.conciergerie.grantId, analysisId);
  if (res.outcome === "consumed" || res.outcome === "already") {
    return NextResponse.json({ ok: true, outcome: res.outcome, remaining: Math.max(0, res.quota - res.used) }, { headers: NO_STORE });
  }
  const error =
    res.outcome === "quota_exhausted"
      ? "Tu as utilisé tes analyses de ce mois-ci. Elles se renouvellent à ta prochaine échéance."
      : "Ton abonnement Conciergerie n'est pas actif pour le moment.";
  return NextResponse.json({ ok: false, outcome: res.outcome, error }, { status: 409, headers: NO_STORE });
}
