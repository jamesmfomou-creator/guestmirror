import { NextResponse } from "next/server";
import { endSession } from "@/lib/access/session";

// "Se déconnecter" (Mon espace): revokes the verified-email session of this
// browser. Rights are untouched; logging in again only needs a new code.
export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  await endSession(res);
  return res;
}
