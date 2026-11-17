import { NextRequest, NextResponse } from "next/server";
import { editTokenFor } from "@/lib/analysisEditToken";
import { findAnalysisByAttemptId } from "@/lib/store";
import { getAttemptState } from "@/lib/analysisAttempts";

// "Did my analysis finish?" -- the question a browser could not ask before.
//
// /api/analyze is one long request (~60 s). When the browser loses it (page
// suspended by the OS, network change), the server still finishes and stores
// the analysis; this endpoint is how the client finds it again instead of
// showing a failure and starting over. See lib/analysisAttempts.ts.
//
// Access model, unchanged from the rest of the app: there are no accounts,
// and knowing an unguessable id is what grants access. The attempt id is a
// random UUID generated in the browser that started the analysis and never
// shown or shared anywhere, and this endpoint returns exactly what that same
// browser would have received from /api/analyze (analysis id + score) --
// nothing more, and no report content.

// Anything else is rejected before touching the database: a short or
// guessable value must never be usable to probe for other people's analyses.
const ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const attemptId = req.nextUrl.searchParams.get("attempt_id") ?? "";
  if (!ATTEMPT_ID_PATTERN.test(attemptId)) {
    return NextResponse.json({ status: "unknown" }, { status: 400, headers: NO_STORE });
  }

  // A stored analysis always wins, whatever the events say: the analysis
  // row is the source of truth for "completed".
  const analysis = await findAnalysisByAttemptId(attemptId);
  if (analysis) {
    return NextResponse.json(
      // The attempt id is a random UUID only the creating browser knows, so
      // the edit token can go back to it here too (resume after a reload).
      { status: "completed", id: analysis.id, overall_score: analysis.overall_score, edit_token: editTokenFor(analysis.id) },
      { headers: NO_STORE }
    );
  }

  const state = await getAttemptState(attemptId);
  if (state.status === "failed") {
    return NextResponse.json({ status: "failed", error_code: state.errorCode }, { headers: NO_STORE });
  }
  return NextResponse.json({ status: state.status }, { headers: NO_STORE });
}
