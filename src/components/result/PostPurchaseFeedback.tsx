"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { UserType, PropertyCountRange } from "@/lib/types";
import { FeedbackPlan, FeedbackRating } from "@/lib/feedback";

/**
 * Shown once, right after a real purchase (see result/[id]/page.tsx --
 * gated on ?unlocked=1, which only appears on the redirect back from
 * Stripe). Purely optional at every step: closing/skipping never blocks
 * access to the report, which is already rendered underneath this.
 */
export function PostPurchaseFeedback({
  analysisId,
  plan,
  userType,
  propertyCountRange,
}: {
  analysisId: string;
  plan: FeedbackPlan;
  userType: UserType | null;
  propertyCountRange: PropertyCountRange | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [testimonialText, setTestimonialText] = useState("");
  const [testimonialPermission, setTestimonialPermission] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  if (dismissed) return null;

  async function submit(finalRating: FeedbackRating | null) {
    setSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          plan,
          userType,
          propertyCountRange,
          feedbackRating: finalRating,
          feedbackText: feedbackText.trim() || null,
          testimonialText: testimonialText.trim() || null,
          testimonialPermission: Boolean(testimonialText.trim()) && testimonialPermission,
        }),
      });
      track("feedback_submitted", { analysisId, rating: finalRating, plan, user_type: userType, property_count_range: propertyCountRange });
      if (testimonialText.trim()) {
        track("testimonial_submitted", { analysisId, testimonial_permission: testimonialPermission });
      }
    } catch {
      // best-effort only -- never block the user over a failed feedback save
    } finally {
      setSending(false);
      setSent(true);
    }
  }

  return (
    <div className="mx-auto mb-8 max-w-xl animate-fade-up">
      <div className="card relative p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Fermer"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-background-alt hover:text-foreground"
        >
          <X size={15} />
        </button>

        {sent ? (
          <p className="pr-6 text-sm font-medium text-foreground">
            Merci pour ton retour, ça nous aide vraiment à améliorer GuestMirror.
          </p>
        ) : rating === null ? (
          <>
            <p className="pr-6 text-sm font-semibold text-foreground">Merci pour ton achat 🙌</p>
            <p className="mt-1.5 text-sm text-muted">Ton analyse t&apos;a-t-elle été utile ?</p>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setRating("positive")}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/50"
              >
                👍 Oui
              </button>
              <button
                type="button"
                onClick={() => setRating("negative")}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/50"
              >
                👎 Pas vraiment
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="pr-6 text-sm font-medium text-foreground">
              {rating === "positive" ? "Merci ! Une suggestion pour améliorer GuestMirror ?" : "Qu'est-ce qu'on pourrait améliorer ?"}
            </p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Facultatif"
              rows={2}
              className="mt-3 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />

            {rating === "positive" && (
              <>
                <p className="mt-4 text-sm font-medium text-foreground">
                  Un petit témoignage nous aiderait beaucoup.
                </p>
                <textarea
                  value={testimonialText}
                  onChange={(e) => setTestimonialText(e.target.value)}
                  placeholder="Facultatif"
                  rows={2}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                {testimonialText.trim().length > 0 && (
                  <label className="mt-2.5 flex items-start gap-2.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={testimonialPermission}
                      onChange={(e) => setTestimonialPermission(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                    />
                    J&apos;accepte que mon témoignage soit affiché sur GuestMirror.
                  </label>
                )}
              </>
            )}

            <Button size="md" className="mt-4 w-full" onClick={() => submit(rating)} disabled={sending}>
              {sending ? "Envoi…" : "Envoyer mon avis"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
