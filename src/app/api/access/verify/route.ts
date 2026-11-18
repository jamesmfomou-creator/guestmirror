import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnalysis } from "@/lib/store";
import { setAccessCookie, verifyAccessCode } from "@/lib/access/session";
import { isDirectLinkReport } from "@/lib/contentLink";

// Checks the emailed code and, on success, sets the access cookie (httpOnly)
// proving this browser reads that mailbox. The address is the report's
// (analysisId) or, for the "continue" code of api/access/request-code, the
// one the visitor typed -- the code was sent there, so only its owner has it.

const code = z.string().trim().min(6).max(12);
const bodySchema = z.union([
  z.object({ analysisId: z.string().uuid(), code }),
  z.object({ email: z.string().trim().email().max(254), code }),
]);
const NO_STORE = { "Cache-Control": "no-store" };

const ERRORS = {
  invalid: "Code incorrect. Vérifie l'e-mail reçu.",
  expired: "Ce code a expiré. Demande un nouveau code.",
  too_many_attempts: "Trop d'essais. Demande un nouveau code.",
} as const;

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: ERRORS.invalid }, { status: 400, headers: NO_STORE });

  let email: string;
  if ("analysisId" in parsed.data) {
    const analysis = await getAnalysis(parsed.data.analysisId);
    if (!analysis?.email) return NextResponse.json({ ok: false, error: "Rapport introuvable." }, { status: 404, headers: NO_STORE });
    email = analysis.email;
  } else {
    email = parsed.data.email;
  }
  if (isDirectLinkReport(email)) return NextResponse.json({ ok: false, error: ERRORS.invalid }, { status: 400, headers: NO_STORE });

  const result = await verifyAccessCode(email, parsed.data.code);
  if (!result.ok) return NextResponse.json({ ok: false, error: ERRORS[result.reason] }, { status: 400, headers: NO_STORE });

  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  setAccessCookie(res, result.token);
  return res;
}
