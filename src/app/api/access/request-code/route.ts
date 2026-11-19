import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnalysis, listAnalysesByEmail } from "@/lib/store";
import { getSubscriptionByEmail } from "@/lib/subscriptions";
import { getAccessForEmail } from "@/lib/access/reportAccess";
import { currentIdentity, requestAccessCode } from "@/lib/access/session";
import { maskEmail } from "@/lib/access/maskEmail";
import { listGrantsByEmail, normalizeEmail } from "@/lib/access/accessStore";
import { isDirectLinkReport } from "@/lib/contentLink";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clientIp, ipCounterKey } from "@/lib/analyzeRateLimit";
import { hashIdentifier } from "@/lib/serverSecret";

// Sends a verification code proving the visitor reads a mailbox. Three uses:
//
//  - "rights" (default, unchanged): the report's owner wants to use the
//    subscription / lifetime rights tied to the report's email. Sent only
//    when that address has rights to use.
//  - "ownership": the report's owner, on a browser that did not create it
//    (another device, or a report older than edit tokens), wants to delete
//    it or complete its details. Sent to the REPORT's address -- never a
//    typed one -- so only its owner can receive it.
//  - "continue": a visitor blocked by the per-IP abuse limit (busy shared
//    network) proves they own the email they just typed; the IP counter then
//    stops applying to them (the email limit still does).
//  - "account": login to Mon espace (/espace) with a typed address. Sent only
//    when that address has already used GuestMirror (an analysis, an offer);
//    the answer is the same either way, so nobody learns who is a customer.
//
// Every address gets at most MAX_CODES_PER_HOUR codes (lib/access/session.ts);
// "continue", the only use with a typed address, is also capped per client
// network so GuestMirror cannot be used to flood mailboxes.

const bodySchema = z.union([
  z.object({ analysisId: z.string().uuid(), purpose: z.enum(["rights", "ownership"]).optional() }),
  z.object({ email: z.string().trim().email().max(254), purpose: z.enum(["continue", "account"]) }),
]);
const NO_STORE = { "Cache-Control": "no-store" };
const CONTINUE_CODES_PER_IP_HOUR = 10;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

async function send(email: string) {
  const result = await requestAccessCode(email);
  if (!result.ok) {
    const error =
      result.reason === "rate_limited"
        ? "Trop de codes demandés. Réessaie dans une heure."
        : "L'e-mail n'a pas pu être envoyé. Réessaie dans quelques instants.";
    return json({ ok: false, error }, result.reason === "rate_limited" ? 429 : 502);
  }
  return json({ ok: true, sentTo: maskEmail(email), ...(result.devCode ? { devCode: result.devCode } : {}) });
}

/** Counts (and records) "continue" code requests per client network. Fail-open. */
async function continueAllowedFromIp(req: NextRequest): Promise<boolean> {
  const ip = clientIp(req.headers);
  if (!SUPABASE_CONFIGURED || !ip) return true;
  const ipHash = hashIdentifier("ip", ipCounterKey(ip));
  if (!ipHash) return true;
  try {
    const supabase = getSupabaseAdmin()! as unknown as {
      from: (t: string) => {
        select: (c: string, o: { count: "exact"; head: true }) => {
          eq: (c: string, v: string) => { eq: (c: string, v: string) => { gte: (c: string, v: string) => Promise<{ count: number | null; error: unknown }> } };
        };
        insert: (row: unknown) => Promise<{ error: unknown }>;
      };
    };
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count, error } = await supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "access_code_continue_server")
      .eq("metadata->>ip_hash", ipHash)
      .gte("created_at", since);
    if (error) return true;
    if ((count ?? 0) >= CONTINUE_CODES_PER_IP_HOUR) return false;
    await supabase.from("analytics_events").insert({
      event_name: "access_code_continue_server",
      source: "server",
      metadata: { purpose: "continue", ip_hash: ipHash },
    });
    return true;
  } catch {
    return true;
  }
}

/** An analysis, a grant (Conciergerie / lifetime) or a legacy subscription under this address. */
async function hasUsedGuestMirror(email: string): Promise<boolean> {
  try {
    const [analyses, grants, legacy] = await Promise.all([
      listAnalysesByEmail(email),
      listGrantsByEmail(email),
      getSubscriptionByEmail(email),
    ]);
    return analyses.length > 0 || grants.length > 0 || legacy !== null;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "Requête invalide." }, 400);
  const body = parsed.data;

  if ("email" in body) {
    const email = normalizeEmail(body.email);
    if (!email || isDirectLinkReport(email)) return json({ ok: false, error: "Requête invalide." }, 400);
    const identity = await currentIdentity().catch(() => null);
    if (identity?.email === email) return json({ ok: true, alreadyVerified: true });
    if (!(await continueAllowedFromIp(req))) {
      return json({ ok: false, error: "Trop de codes demandés depuis ce réseau. Réessaie dans une heure." }, 429);
    }
    if (body.purpose === "account" && !(await hasUsedGuestMirror(email))) {
      // Same answer as a real send: never reveal whether an address is a customer.
      return json({ ok: true, sentTo: maskEmail(email) });
    }
    return send(email);
  }

  const analysis = await getAnalysis(body.analysisId);
  if (!analysis?.email) return json({ ok: false, error: "Rapport introuvable." }, 404);

  if (body.purpose === "ownership") {
    // The content link files reports under an internal address: no mailbox to prove.
    if (isDirectLinkReport(analysis.email)) return json({ ok: false, error: "Ce rapport ne peut pas être vérifié par e-mail." }, 403);
    const access = await getAccessForEmail(analysis.email);
    if (access.verified) return json({ ok: true, alreadyVerified: true });
    return send(analysis.email);
  }

  const access = await getAccessForEmail(analysis.email);
  if (!access.needsVerification) {
    // Nothing to unlock with a code (no rights, or already verified).
    return json({ ok: true, alreadyVerified: access.verified });
  }
  return send(access.email ?? analysis.email);
}
