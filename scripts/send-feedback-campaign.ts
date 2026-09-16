/**
 * One-off campaign: ask users who completed an analysis but never paid
 * for feedback. NOT wired into any API route, NOT run automatically --
 * this is a manual, one-time script, run by hand from a terminal after
 * reviewing the printed recipient list.
 *
 * Usage:
 *   npx tsx scripts/send-feedback-campaign.ts            (dry run, default)
 *   npx tsx scripts/send-feedback-campaign.ts --send      (actually sends)
 *
 * Safety:
 * - Dry run by default -- prints exactly who WOULD receive the email and
 *   why each excluded person was excluded, sends nothing.
 * - Requires migration 0006_email_campaign_sends.sql to already be
 *   applied (checks for the table before doing anything else).
 * - Requires RESEND_API_KEY (and ideally a verified RESEND_FROM_EMAIL)
 *   to be set -- refuses to run --send otherwise.
 * - Anyone already recorded in email_campaign_sends for this
 *   campaign_key is skipped, so re-running after a partial failure never
 *   re-sends to someone who already got it.
 * - Every send is followed immediately by its own tracking insert (never
 *   batched), so a crash mid-run leaves an accurate picture of exactly
 *   who was actually sent to.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

// This is a standalone script, not run through Next.js -- .env.local
// isn't auto-loaded the way it is for `next dev`/`next build`. Minimal
// manual load rather than adding a dotenv dependency for one script.
function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const CAMPAIGN_KEY = "feedback_non_buyers_v1";
const SEND_DELAY_MS = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBVIOUS_TEST_PATTERNS = [
  /@example\.com$/i,
  /^diag-/i,
  /^perf-test/i,
  /^real-timing-test/i,
  /^ai-error-test/i,
  /^e2e-/i,
  /^url-profile/i,
  /^showcase-loading/i,
  /^title-test/i,
  /^schema-probe/i,
];
// Edit this list before running if the audit turns up more junk/typo
// addresses -- see the campaign report for the ones already identified.
const MANUAL_EXCLUDE = new Set<string>([
  "aa@oo.com",
  "nn@gmail.com",
  "dila@hu.com",
  "fhh@gmail.com",
  "a@gogo.xom",
  "poutchoun13@gmail.om",
  "rebikeh996@ehwit.com",
]);
const INTERNAL_EMAILS = new Set(["james.mfomou@gmail.com"]);

async function main() {
  const dryRun = !process.argv.includes("--send");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient<Database>(url, key);

  // Fail loudly rather than silently no-op if the migration hasn't run yet.
  const tableCheck = await supabase.from("email_campaign_sends").select("id").limit(1);
  if (tableCheck.error) {
    console.error(
      "email_campaign_sends table not found -- run supabase/migrations/0006_email_campaign_sends.sql first.\n" +
        tableCheck.error.message
    );
    process.exit(1);
  }

  const [{ data: analyses, error: analysesError }, { data: subs, error: subsError }, { data: alreadySent, error: sentError }] =
    await Promise.all([
      supabase.from("analyses").select("email, is_unlocked, created_at"),
      supabase.from("subscriptions").select("email"),
      supabase.from("email_campaign_sends").select("email").eq("campaign_key", CAMPAIGN_KEY),
    ]);
  if (analysesError || subsError || sentError) {
    console.error("Query failed:", analysesError || subsError || sentError);
    process.exit(1);
  }

  const paidEmails = new Set<string>();
  for (const a of analyses ?? []) if (a.is_unlocked && a.email) paidEmails.add(a.email.trim().toLowerCase());
  for (const s of subs ?? []) if (s.email) paidEmails.add(s.email.trim().toLowerCase());
  const alreadySentEmails = new Set((alreadySent ?? []).map((r) => r.email.trim().toLowerCase()));

  const byEmail = new Map<string, { email: string; count: number; lastDate: string }>();
  for (const a of analyses ?? []) {
    const raw = (a.email ?? "").trim();
    if (!raw || !EMAIL_RE.test(raw)) continue;
    const emailKey = raw.toLowerCase();
    if (!byEmail.has(emailKey)) byEmail.set(emailKey, { email: raw, count: 0, lastDate: a.created_at });
    const entry = byEmail.get(emailKey)!;
    entry.count++;
    if (a.created_at > entry.lastDate) entry.lastDate = a.created_at;
  }

  const recipients: { email: string; count: number; lastDate: string }[] = [];
  const skipped: { email: string; reason: string }[] = [];
  for (const [emailKey, entry] of byEmail) {
    if (paidEmails.has(emailKey)) {
      skipped.push({ email: entry.email, reason: "a payé" });
    } else if (INTERNAL_EMAILS.has(emailKey)) {
      skipped.push({ email: entry.email, reason: "adresse interne" });
    } else if (OBVIOUS_TEST_PATTERNS.some((re) => re.test(entry.email))) {
      skipped.push({ email: entry.email, reason: "email de test" });
    } else if (MANUAL_EXCLUDE.has(emailKey)) {
      skipped.push({ email: entry.email, reason: "exclu manuellement (voir MANUAL_EXCLUDE)" });
    } else if (alreadySentEmails.has(emailKey)) {
      skipped.push({ email: entry.email, reason: "a déjà reçu cette campagne" });
    } else {
      recipients.push(entry);
    }
  }
  recipients.sort((a, b) => b.lastDate.localeCompare(a.lastDate));

  console.log(`Campaign: ${CAMPAIGN_KEY}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (nothing will be sent)" : "SEND"}`);
  console.log(`Eligible recipients: ${recipients.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log("");
  for (const r of recipients) {
    console.log(`  ${r.email}  (${r.count} analyse${r.count > 1 ? "s" : ""}, dernière le ${r.lastDate.slice(0, 10)})`);
  }

  if (dryRun) {
    console.log("\nDry run only -- pass --send to actually send.");
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("\nRESEND_API_KEY is not set -- refusing to send.");
    process.exit(1);
  }

  const { sendFeedbackRequestEmail } = await import("../src/lib/email");

  console.log("");
  let sentCount = 0;
  let failCount = 0;
  for (const r of recipients) {
    try {
      await sendFeedbackRequestEmail({ to: r.email });
      const { error } = await supabase.from("email_campaign_sends").insert({
        email: r.email.toLowerCase(),
        campaign_key: CAMPAIGN_KEY,
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
      sentCount++;
      console.log(`  sent: ${r.email}`);
    } catch (err) {
      failCount++;
      console.error(`  FAILED: ${r.email}`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
  }

  console.log(`\nDone. Sent: ${sentCount}. Failed: ${failCount}.`);
}

main();
