import { EMAIL_CONFIGURED, SITE_URL } from "@/lib/env";
import { BRAND_NAME } from "@/lib/brand";

/**
 * Transactional email via Resend's HTTP API (plain fetch, no SDK -- one
 * call site, not worth a dependency). Added after a support case where a
 * customer paid but had no way to find her report again besides keeping
 * the browser tab open: this sends the direct link the moment the
 * backend confirms a real unlock (webhook-driven, never a client
 * redirect), so it can't fire without a genuine payment.
 *
 * No-ops safely if RESEND_API_KEY isn't set -- must never block or
 * break payment/unlock handling, which is why every call site wraps
 * this in its own try/catch on top.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "GuestMirror <onboarding@resend.dev>";

async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  if (!EMAIL_CONFIGURED) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

/**
 * One-off feedback request to users who completed an analysis but never
 * paid (see scripts/send-feedback-campaign.ts) -- deliberately plain,
 * no button, no branding-heavy layout, no link: the sole purpose is a
 * reply with feedback, not a click.
 */
export async function sendFeedbackRequestEmail(params: { to: string }): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: "Ton avis sur GuestMirror",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1c1a17; font-size: 15px; line-height: 1.6;">
        <p>Bonjour,</p>
        <p>Merci d'avoir testé GuestMirror 🙏</p>
        <p>Je suis en train d'améliorer l'outil et j'aimerais beaucoup avoir ton retour.</p>
        <p>Qu'est-ce que tu as aimé ?<br>Et s'il y avait une chose à améliorer ou à ajouter, ce serait quoi ?</p>
        <p>Même quelques mots me suffisent.</p>
        <p>Merci beaucoup,<br>James<br>${BRAND_NAME}</p>
      </div>
    `,
  });
}

export async function sendUnlockEmail(params: {
  to: string;
  analysisId: string;
}): Promise<void> {
  const url = `${SITE_URL}/result/${params.analysisId}?unlocked=1`;
  await sendEmail({
    to: params.to,
    subject: `Ton ${BRAND_NAME} complet est prêt`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1c1a17;">
        <h1 style="font-size: 20px;">Ton analyse complète est prête ✅</h1>
        <p>Merci pour ton paiement. Tu peux dès maintenant consulter toutes tes recommandations : photo à mettre en avant, ordre optimisé, titres, description, actions prioritaires.</p>
        <p style="margin: 24px 0;">
          <a href="${url}" style="background: #d9673f; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600; display: inline-block;">
            Voir mon analyse complète
          </a>
        </p>
        <p style="font-size: 13px; color: #6f6a62;">Garde ce lien précieusement, c'est le tien : ${url}</p>
        <p style="font-size: 13px; color: #6f6a62;">— L'équipe ${BRAND_NAME}</p>
      </div>
    `,
  });
}
