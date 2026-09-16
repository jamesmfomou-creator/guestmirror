/**
 * Follow-up to scripts/send-feedback-campaign.ts: a shorter reminder for
 * people who received the first feedback request but (as far as we know)
 * never replied. NOT wired into any API route, NOT run automatically,
 * NOT scheduled -- a human runs this by hand, after waiting a few days,
 * after reviewing the printed list.
 *
 * Usage:
 *   npx tsx scripts/send-feedback-campaign-reminder.ts            (dry run, default)
 *   npx tsx scripts/send-feedback-campaign-reminder.ts --send      (actually sends)
 *
 * Audience: exactly the people recorded as sent for the ORIGINAL
 * campaign (feedback_non_buyers_v1) -- not a fresh eligibility scan, so
 * someone who only submitted an analysis after the first email went out
 * never gets a "reminder" for an email they never received.
 *
 * We have no reply-tracking (replies land in a normal inbox, not
 * anything this app sees) -- ALREADY_REPLIED below is the manual list to
 * edit before running, same pattern as MANUAL_EXCLUDE in the original
 * script.
 *
 * Safety: same as the original script -- dry run by default, requires
 * RESEND_API_KEY, skips anyone already recorded for THIS campaign_key
 * (so re-running never double-sends the reminder itself), skips anyone
 * who has paid since the first email, records a tracking row immediately
 * after each successful send.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

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

const ORIGINAL_CAMPAIGN_KEY = "feedback_non_buyers_v1";
const REMINDER_CAMPAIGN_KEY = "feedback_non_buyers_v1_reminder";
const SEND_DELAY_MS = 500;

// Edit this before running: anyone who already replied to the first
// email (check the james@guestmirror.fr inbox), lowercase.
const ALREADY_REPLIED = new Set<string>([
  // "someone@example.com",
]);

async function main() {
  const dryRun = !process.argv.includes("--send");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient<Database>(url, key);

  const [
    { data: originalSends, error: originalError },
    { data: reminderSends, error: reminderError },
    { data: analyses, error: analysesError },
    { data: subs, error: subsError },
  ] = await Promise.all([
    supabase.from("email_campaign_sends").select("email, sent_at").eq("campaign_key", ORIGINAL_CAMPAIGN_KEY),
    supabase.from("email_campaign_sends").select("email").eq("campaign_key", REMINDER_CAMPAIGN_KEY),
    supabase.from("analyses").select("email, is_unlocked"),
    supabase.from("subscriptions").select("email"),
  ]);
  if (originalError || reminderError || analysesError || subsError) {
    console.error("Query failed:", originalError || reminderError || analysesError || subsError);
    process.exit(1);
  }

  const paidEmails = new Set<string>();
  for (const a of analyses ?? []) if (a.is_unlocked && a.email) paidEmails.add(a.email.trim().toLowerCase());
  for (const s of subs ?? []) if (s.email) paidEmails.add(s.email.trim().toLowerCase());

  const alreadyReminded = new Set((reminderSends ?? []).map((r) => r.email.trim().toLowerCase()));

  const recipients: { email: string; firstSentAt: string }[] = [];
  const skipped: { email: string; reason: string }[] = [];
  for (const row of originalSends ?? []) {
    const emailKey = row.email.trim().toLowerCase();
    if (paidEmails.has(emailKey)) {
      skipped.push({ email: row.email, reason: "a payé depuis le premier email" });
    } else if (ALREADY_REPLIED.has(emailKey)) {
      skipped.push({ email: row.email, reason: "a déjà répondu (voir ALREADY_REPLIED)" });
    } else if (alreadyReminded.has(emailKey)) {
      skipped.push({ email: row.email, reason: "a déjà reçu la relance" });
    } else {
      recipients.push({ email: row.email, firstSentAt: row.sent_at ?? "" });
    }
  }
  recipients.sort((a, b) => a.firstSentAt.localeCompare(b.firstSentAt));

  console.log(`Campaign: ${REMINDER_CAMPAIGN_KEY}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (nothing will be sent)" : "SEND"}`);
  console.log(`Base (reçu le premier email): ${(originalSends ?? []).length}`);
  console.log(`Eligible pour la relance: ${recipients.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log("");
  for (const r of recipients) {
    console.log(`  ${r.email}`);
  }

  if (dryRun) {
    console.log("\nDry run only -- pass --send to actually send.");
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("\nRESEND_API_KEY is not set -- refusing to send.");
    process.exit(1);
  }

  const { sendFeedbackReminderEmail } = await import("../src/lib/email");

  console.log("");
  let sentCount = 0;
  let failCount = 0;
  for (const r of recipients) {
    try {
      await sendFeedbackReminderEmail({ to: r.email });
      const { error } = await supabase.from("email_campaign_sends").insert({
        email: r.email.toLowerCase(),
        campaign_key: REMINDER_CAMPAIGN_KEY,
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
