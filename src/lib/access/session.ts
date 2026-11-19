import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { DEMO_MODE, EMAIL_CONFIGURED } from "@/lib/env";
import { sendAccessCodeEmail } from "@/lib/email";
import {
  deleteSession,
  findSession,
  insertSession,
  insertVerification,
  normalizeEmail,
  recentVerifications,
  updateVerification,
  type SessionIdentity,
} from "./accessStore";

// Proof that the visitor reads the mailbox their rights are tied to (there
// are no accounts). A 6-digit code is emailed; once typed, an opaque random
// token is stored in an httpOnly cookie (only its hash is kept server side).
//
// Limits: a code lives 10 minutes and allows 5 attempts; at most 5 codes per
// email per hour. A wrong guess never reveals whether the email has rights.

export const ACCESS_COOKIE = "gm_access";
const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const SESSION_TTL_MS = 30 * 86_400_000;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashCode(email: string, code: string, salt: string): string {
  return `${salt}:${sha256(`${salt}:${email}:${code}`)}`;
}

function codeMatches(stored: string, email: string, code: string): boolean {
  const [salt] = stored.split(":");
  const expected = Buffer.from(hashCode(email, code, salt));
  const actual = Buffer.from(stored);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type RequestCodeResult =
  | { ok: true; devCode?: string }
  | { ok: false; reason: "rate_limited" | "send_failed" };

/** Emails a fresh code to `email`. The caller decides whether the email has rights. */
export async function requestAccessCode(rawEmail: string): Promise<RequestCodeResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: "send_failed" };
  const lastHour = await recentVerifications(email, new Date(Date.now() - 3_600_000));
  if (lastHour.length >= MAX_CODES_PER_HOUR) return { ok: false, reason: "rate_limited" };

  // Local demo only (no email provider, no AI key, not a production build):
  // the code is returned so the flow can be tested end to end.
  const exposeForDemo = DEMO_MODE && !EMAIL_CONFIGURED && process.env.NODE_ENV !== "production";
  // Without an email provider a code could never arrive: say so instead of
  // pretending it was sent (an owner would be locked out of their rights).
  if (!EMAIL_CONFIGURED && !exposeForDemo) {
    console.error("[access] cannot send a verification code: RESEND_API_KEY is not configured");
    return { ok: false, reason: "send_failed" };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomBytes(8).toString("hex");
  await insertVerification(email, hashCode(email, code, salt), new Date(Date.now() + CODE_TTL_MS));

  try {
    await sendAccessCodeEmail({ to: email, code });
  } catch (err) {
    console.error("[access] code email failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "send_failed" };
  }
  return exposeForDemo ? { ok: true, devCode: code } : { ok: true };
}

export type VerifyResult = { ok: true; token: string } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

/** Checks a code against the latest one sent to `email`; on success opens a session. */
export async function verifyAccessCode(rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (!email || code.length !== 6) return { ok: false, reason: "invalid" };

  const [latest] = await recentVerifications(email, new Date(Date.now() - CODE_TTL_MS));
  if (!latest || latest.consumedAt) return { ok: false, reason: "expired" };
  if (new Date(latest.expiresAt).getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (latest.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  if (!codeMatches(latest.codeHash, email, code)) {
    await updateVerification(latest.id, { attempts: latest.attempts + 1 });
    return { ok: false, reason: latest.attempts + 1 >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
  }
  await updateVerification(latest.id, { consumed: true });
  return { ok: true, token: await openSession(email, null) };
}

/** Opens a session for `email`, optionally limited to one checkout's rights. Returns the cookie token. */
export async function openSession(email: string, scopeCheckoutSessionId: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await insertSession(sha256(token), email, new Date(Date.now() + SESSION_TTL_MS), scopeCheckoutSessionId);
  return token;
}

export function setAccessCookie(res: NextResponse, token: string) {
  res.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** The identity proven by this browser's cookie, if any (server components and route handlers). */
export async function currentIdentity(): Promise<SessionIdentity | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  try {
    return await findSession(sha256(token));
  } catch {
    return null;
  }
}

/** Logout: revokes this browser's session server side and clears the cookie. */
export async function endSession(res: NextResponse): Promise<void> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (token && token.length <= 200) {
    try {
      await deleteSession(sha256(token));
    } catch (err) {
      console.error("[access] session revoke failed:", err instanceof Error ? err.message : err);
    }
  }
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
