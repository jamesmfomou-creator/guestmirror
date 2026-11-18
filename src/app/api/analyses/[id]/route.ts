import { NextRequest, NextResponse } from "next/server";
import { deleteAnalysis, getAnalysis, updateAnalysisInput } from "@/lib/store";
import { updateAnalysisInputSchema } from "@/lib/validation";
import { EDIT_TOKEN_HEADER, isValidEditToken } from "@/lib/analysisEditToken";
import { normalizeEmail } from "@/lib/access/accessStore";
import { currentIdentity } from "@/lib/access/session";
import type { AnalysisRecord } from "@/lib/types";

// Changing or deleting an analysis requires proof of ownership, not just its
// id (the id is in the report link, which is shared by email):
//  - the edit token handed to the browser that created it
//    (lib/analysisEditToken.ts), or
//  - a session that verified the analysis' email (lib/access/session.ts),
//    for the owner on another device.
// Reading a report is unchanged: the link remains the access to it.

const NO_STORE = { "Cache-Control": "no-store" };

async function mayEdit(req: NextRequest, analysis: AnalysisRecord): Promise<boolean> {
  if (isValidEditToken(analysis.id, req.headers.get(EDIT_TOKEN_HEADER))) return true;
  const email = normalizeEmail(analysis.email);
  if (!email) return false;
  try {
    return (await currentIdentity())?.email === email;
  } catch {
    return false;
  }
}

const forbidden = () =>
  NextResponse.json(
    { error: "Cette action n'est possible que depuis l'appareil qui a créé l'analyse, ou après avoir vérifié ton email." },
    { status: 403, headers: NO_STORE }
  );

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = await getAnalysis(id);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404, headers: NO_STORE });
  }
  if (!(await mayEdit(req, analysis))) return forbidden();
  await deleteAnalysis(id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = await getAnalysis(id);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404, headers: NO_STORE });
  }

  const parsed = updateAnalysisInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Les informations envoyées ne sont pas valides." }, { status: 400, headers: NO_STORE });
  }
  if (!(await mayEdit(req, analysis))) return forbidden();

  // Only the fields actually sent are written (goal/profile answered during
  // the analysis, optional listing details). Never the result, the score,
  // the unlock state or the email.
  const fields = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  if (Object.keys(fields).length > 0) await updateAnalysisInput(id, fields);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
