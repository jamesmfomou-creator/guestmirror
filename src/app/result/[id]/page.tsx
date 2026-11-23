import type { Metadata } from "next";
import { coverageNote } from "@/lib/photoCoverage";
import { notFound } from "next/navigation";
import { getAnalysis } from "@/lib/store";
import { resolveImageUrls } from "@/lib/images";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { verdictFor } from "@/lib/utils";
import { ScoreHeader } from "@/components/result/ScoreHeader";
import { Paywall } from "@/components/result/Paywall";
import { FullPriorities } from "@/components/result/FullPriorities";
import { StrengthsWeaknesses } from "@/components/result/StrengthsWeaknesses";
import { TitleSection } from "@/components/result/TitleSection";
import { DescriptionSection } from "@/components/result/DescriptionSection";
import { PhotoGrid } from "@/components/result/PhotoGrid";
import { ActionPlan } from "@/components/result/ActionPlan";
import { BeforeAfter, RescanCTA } from "@/components/result/RescanSection";
import { ShareCard } from "@/components/result/ShareCard";
import { ShareCardVerdict } from "@/components/result/ShareCardVerdict";
import { CoverPhotoImpact } from "@/components/result/CoverPhotoImpact";
import { GuestQuestions } from "@/components/result/GuestQuestions";
import { DeleteAnalysis } from "@/components/result/DeleteAnalysis";
import { OptionalInfoCard } from "@/components/result/OptionalInfoCard";
import { ManageSubscriptionLink } from "@/components/result/ManageSubscriptionLink";
import { BRAND_NAME } from "@/lib/brand";
import { getAccessForEmail } from "@/lib/access/reportAccess";
import { AccessPanel, BuyAddonButton } from "@/components/result/AccessPanel";
import { ADDON_PACK, addonPackAvailable } from "@/lib/plans";
import { isDirectLinkReport } from "@/lib/contentLink";
import { PaymentPending } from "@/components/result/PaymentPending";
import type { FeedbackPlan } from "@/lib/feedback";
import { getInputMethodForAnalysis } from "@/lib/inputMethod";
import { PostPurchaseFeedback } from "@/components/result/PostPurchaseFeedback";
import { IncompleteResultNotice } from "@/components/result/IncompleteResultNotice";
import { isIncompleteResult } from "@/lib/resultShape";
import { getPaywallVariantServer } from "@/lib/paywallExperiment-server";
import { buildPaywallPreview } from "@/lib/paywallPreview";
import { displayListingTitle, goalExplanation, personalizeResult } from "@/lib/goalPersonalization";
import { ListingContext } from "@/components/result/ListingContext";
import { FreeInsight } from "@/components/result/FreeInsight";
import { ImprovementPlanCard } from "@/components/result/ImprovementPlanCard";
import { buildFreeReveal } from "@/lib/freeReveal";
import { GoalPrompt } from "@/components/result/GoalPrompt";
import { OwnershipVerify } from "@/components/result/OwnershipVerify";
import { maskEmail } from "@/lib/access/maskEmail";
import { EMAIL_CONFIGURED } from "@/lib/env";
import { buildListingMakeover, listingMakeoverEnabled } from "@/lib/listingMakeover";
import { ListingMakeover } from "@/components/result/ListingMakeover";

export const metadata: Metadata = {
  title: `Ton ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    canceled?: string;
    unlocked?: string;
    plus?: string;
    lifetime?: string;
    checkout?: string;
    offer?: string;
    addon?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const analysis = await getAnalysis(id);
  if (!analysis) notFound();

  const images = await resolveImageUrls(analysis.images);
  // Rights tied to the report's email (pricing v2, lib/access): a report
  // bought on its own is readable by its link as before; subscription and
  // lifetime rights apply only once this browser has verified the email.
  const access = await getAccessForEmail(analysis.email);
  const unlocked = analysis.is_unlocked || access.unlimited !== null;
  // A verified Conciergerie subscriber with analyses left unlocks with a
  // credit instead: the paywall would sell them a report already covered.
  const creditUsable = !unlocked && access.conciergerie?.usable === true;
  const purchasedPlan: FeedbackPlan =
    sp.offer === "conciergerie" || sp.offer === "lifetime"
      ? sp.offer
      : sp.lifetime === "1"
        ? "lifetime"
        : sp.plus === "1"
          ? "plus"
          : "one_time";
  // Legacy rows stored with a score but none of the detail (see
  // lib/resultShape.ts). Shown as what they are, in both A/B arms alike,
  // instead of a teaser and a paywall for recommendations that don't exist.
  const incomplete = isIncompleteResult(analysis.result);
  // Read from the analysis_completed event tracked at submission time --
  // NOT re-derived from analysis.images, since a pure-URL submission also
  // ends up with stored images (extracted from the listing page) that
  // would otherwise be indistinguishable from a real "mixed" submission.
  // Falls back to a best-effort guess only if that event can't be found
  // (e.g. Supabase not configured locally, or a pre-instrumentation
  // historical analysis).
  const resultInputMethod =
    (await getInputMethodForAnalysis(id)) ??
    (analysis.listing_url ? (analysis.images.length > 0 ? "mixed" : "airbnb_url") : "screenshot");

  // Paywall presentation experiment (lib/paywallExperiment.ts), independent
  // of the A/B variant above. null = control: the page below renders as it
  // did before the experiment. The preview holds names and counts only, and
  // is built only for a visitor who is about to see the paywall.
  const paywallVariant = await getPaywallVariantServer();
  const paywallPreview =
    paywallVariant === "v2" && !unlocked && !incomplete ? buildPaywallPreview(analysis.result) : null;
  const emailsReportLink = EMAIL_CONFIGURED && Boolean(analysis.email);
  // One-time "10 analyses" pack: offered with Conciergerie only, and only
  // when its one-time Stripe price is configured for this environment.
  const addonAvailable = addonPackAvailable();

  // Locked teaser figures (both A/B variants, control paywall): counts of
  // what this report really holds, same source as the v2 paywall preview.
  // Free result (reveal_v1): the only projection of the report that reaches a
  // locked page, besides the paywall v2 preview (names and counts).
  // Journey goal_value_v1: the revealed weakness is tied to the stored goal
  // (lib/goalValue.ts), wording only; no goal: the neutral framing.
  const freeReveal = !unlocked && !incomplete ? buildFreeReveal(analysis.result, analysis.goal) : null;
  // Free result makeover_v1: "Avant / Après" of the visitor's own listing,
  // built from the stored report and its real photos (no AI call, nothing
  // invented). null: nothing to compare, or switched off for an incident
  // (LISTING_MAKEOVER_DISABLED=1) -- the page then renders as before.
  const makeoverOn = listingMakeoverEnabled();
  const makeover =
    freeReveal && makeoverOn ? buildListingMakeover(analysis.result, images, { city: analysis.city }) : null;

  const previous = analysis.previous_analysis_id
    ? await getAnalysis(analysis.previous_analysis_id)
    : null;

  // Goal personalisation (lib/goalPersonalization.ts): the same report,
  // reordered and flagged for the visitor's goal -- score and texts
  // untouched, no AI call. The free view keeps showing the model's #1
  // priority, which the reordering never moves. null without a goal.
  const personal = incomplete
    ? null
    : personalizeResult(analysis.result, analysis.goal, { hasPrevious: Boolean(previous) });
  const report = personal?.result ?? analysis.result;
  const listingTitle = displayListingTitle(analysis.result);
  const goalMode = personal?.mode ?? null;

  return (
    <div className="px-5 pb-24 pt-12 sm:pt-16">
      {unlocked && sp.unlocked === "1" && (
        // Client signal only, once per report and browser (a reopened
        // ?unlocked=1 URL used to count again). Confirmed payments are
        // payment_completed, sent by the Stripe webhook with a dedupe key.
        <AnalyticsBeacon event="purchase_completed" props={{ analysisId: id }} onceKey={id} />
      )}
      {unlocked && sp.unlocked === "1" && (
        <PostPurchaseFeedback
          analysisId={id}
          plan={purchasedPlan}
          userType={analysis.user_type}
          propertyCountRange={analysis.property_count_range}
        />
      )}
      {unlocked && <AnalyticsBeacon event="full_analysis_viewed" props={{ analysisId: id }} />}
      {unlocked && previous && (
        <AnalyticsBeacon event="before_after_viewed" props={{ analysisId: id }} />
      )}
      {!unlocked && <AnalyticsBeacon event="aha_moment_viewed" props={{ analysisId: id }} />}
      {!unlocked && (
        <AnalyticsBeacon
          event="free_result_viewed"
          props={{
            analysisId: id,
            overall_score: analysis.overall_score,
            verdict: verdictFor(analysis.overall_score).short,
          }}
        />
      )}
      {/* "Aha moment" A/B test beacons (see lib/ab.ts) -- fired for both
          variants so the funnel steps in /admin/analytics stay comparable. */}
      {!unlocked && (
        <AnalyticsBeacon
          event="result_viewed"
          props={{ analysisId: id, input_method: resultInputMethod }}
        />
      )}
      {!unlocked && <AnalyticsBeacon event="aha_viewed" props={{ analysisId: id }} />}
      {!unlocked && (
        <AnalyticsBeacon
          event="score_viewed"
          props={{
            analysisId: id,
            overall_score: analysis.overall_score,
            verdict: verdictFor(analysis.overall_score).short,
          }}
        />
      )}

      {/* Which listing, which goal. One free result for everyone since
          reveal_v1 (lib/resultVersion.ts): the "Aha" A/B test no longer
          changes this page. */}
      <ListingContext
        photoUrl={images[0] ?? null}
        title={listingTitle}
        city={analysis.city}
        goalReminder={personal?.reminder ?? null}
        goalExplanation={personal ? goalExplanation(personal, unlocked) : null}
        coverageNote={coverageNote(analysis.result.photo_coverage)}
      />
      {/* No goal given during the onboarding: ask once, discreetly, to the
          browser allowed to change this analysis. Never on the content link. */}
      {!personal && !incomplete && !isDirectLinkReport(analysis.email) && (
        <GoalPrompt analysisId={id} serverAllowed={access.verified} />
      )}

      <ScoreHeader
        result={analysis.result}
        locked={!unlocked}
        hideBreakdown={incomplete}
        attentionCount={freeReveal?.weaknessCount}
      />

      {incomplete && (
        <IncompleteResultNotice
          listingUrl={analysis.listing_url}
          unlocked={unlocked}
          canRerunUnlocked={access.unlimited !== null || access.conciergerie?.usable === true}
        />
      )}

      {!unlocked && !incomplete && sp.checkout === "success" && <PaymentPending />}
      {sp.addon === "success" && (
        <p role="status" className="mx-auto mt-6 max-w-xl rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3 text-center text-sm text-accent-hover">
          Merci ! Tes {ADDON_PACK.credits} analyses supplémentaires sont ajoutées dès que Stripe confirme le paiement
          (en général quelques secondes). Actualise la page si elles n&apos;apparaissent pas encore.
        </p>
      )}
      {sp.addon === "canceled" && (
        <p className="mx-auto mt-6 max-w-xl rounded-2xl bg-score-mid/10 px-4 py-3 text-center text-sm text-score-mid">
          L&apos;achat du pack a été annulé. Rien n&apos;a été débité.
        </p>
      )}
      {!unlocked && !incomplete && sp.checkout !== "success" && access.needsVerification && (
        <AccessPanel mode="verify" analysisId={id} />
      )}
      {!unlocked && !incomplete && access.conciergerie && (
        <AccessPanel
          mode="credit"
          analysisId={id}
          remaining={access.conciergerie.remaining}
          quota={access.conciergerie.quota}
          extraRemaining={access.conciergerie.extraRemaining}
          nextSource={access.conciergerie.nextSource}
          canBuyAddon={addonAvailable && access.conciergerie.canBuyAddon && !access.unlimited}
          periodEnd={access.conciergerie.periodEnd}
          blockedReason={access.conciergerie.blockedReason}
          canManage={access.hasManageableSubscription}
        />
      )}

      {/* Free result (reveal_v1): one real weakness revealed without its
          correction, what the paid report really contains, then the
          existing offers. Everything here comes from buildFreeReveal(): plain
          strings and counts, never the report itself. */}
      {!unlocked && !incomplete && freeReveal && (
        <>
          <FreeInsight reveal={freeReveal} analysisId={id} />
          {makeover ? (
            <ListingMakeover makeover={makeover} analysisId={id} showOffersButton={!creditUsable} />
          ) : (
            <AnalyticsBeacon
              event="listing_preview_unavailable"
              props={{ analysisId: id, reason: makeoverOn ? "nothing_to_compare" : "disabled" }}
            />
          )}
          <ImprovementPlanCard
            analysisId={id}
            insightShown={freeReveal.insight !== null}
            weaknessCount={freeReveal.weaknessCount}
            reportHighlights={freeReveal.reportHighlights}
            reportMore={freeReveal.reportMore}
            showOffersButton={!creditUsable}
          />
          {!creditUsable && (
            <Paywall
              analysisId={id}
              canceled={sp.canceled === "1"}
              overallScore={analysis.overall_score}
              inputMethod={resultInputMethod}
              userType={analysis.user_type}
              propertyCountRange={analysis.property_count_range}
              addonAvailable={addonAvailable}
              singleCopy
              hidePreviewContents
              revealOnRequest
              {...(paywallPreview ? { preview: paywallPreview, emailsReportLink } : {})}
            />
          )}
          <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed text-muted-2">
            {analysis.result.disclaimer}
          </p>
          <ShareCardVerdict score={analysis.overall_score} />
        </>
      )}

      {/* Nothing below was produced for an incomplete analysis: empty
          sections and 0/100 verdicts would read as findings. */}
      {unlocked && incomplete && <DeleteAnalysis analysisId={id} serverAllowed={access.verified} />}

      {unlocked && !incomplete && (
        <>
          {previous && <BeforeAfter previous={previous.result} current={analysis.result} />}
          <FullPriorities result={report} matches={personal?.priorityMatches} />
          {goalMode === "rescan" && <RescanCTA analysisId={id} />}
          {(goalMode === "topic" && personal?.goal === "improve_appeal"
            ? (["cover", "photos", "title", "weaknesses", "description", "questions"] as const)
            : goalMode === "topic" && personal?.goal === "improve_photos"
              ? (["photos", "cover", "title", "weaknesses", "description", "questions"] as const)
            : goalMode === "topic" && personal?.goal === "reduce_hesitation"
              ? (["weaknesses", "questions", "description", "cover", "title", "photos"] as const)
              : (["weaknesses", "cover", "title", "description", "photos", "questions"] as const)
          ).map((section) => {
            // Section order follows the goal (improve_appeal: visuals first;
            // reduce_hesitation: what is missing or unclear first). Same
            // sections, same content, whatever the order.
            switch (section) {
              case "weaknesses":
                return <StrengthsWeaknesses key={section} result={report} matches={personal?.weaknessMatches} />;
              case "cover":
                return <CoverPhotoImpact key={section} result={report} />;
              case "title":
                return <TitleSection key={section} result={report} />;
              case "description":
                return <DescriptionSection key={section} result={report} />;
              case "photos":
                return <PhotoGrid key={section} result={report} images={images} />;
              case "questions":
                return <GuestQuestions key={section} result={report} />;
            }
          })}
          <ActionPlan result={report} matches={personal?.actionMatches} />
          {!analysis.city && !analysis.property_type && !analysis.guest_capacity && !analysis.nightly_price && (
            <OptionalInfoCard analysisId={id} serverAllowed={access.verified} />
          )}
          {goalMode !== "rescan" && <RescanCTA analysisId={id} />}
          <ShareCard result={analysis.result} />
          <DeleteAnalysis analysisId={id} serverAllowed={access.verified} />
        </>
      )}
      {/* Owner on a browser that cannot change this report yet (another
          device, or a report older than edit tokens): prove the report's
          email to get "Supprimer" / "Compléter la fiche" back. */}
      {unlocked && analysis.email && !isDirectLinkReport(analysis.email) && (
        <OwnershipVerify analysisId={id} maskedEmail={maskEmail(analysis.email)} serverAllowed={access.verified} />
      )}

      {unlocked && access.unlimited === "legacy_plus" && (
        <p className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-2 text-xs text-muted-2">
          <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-hover">
            GuestMirror Plus actif
          </span>
          <ManageSubscriptionLink analysisId={id} />
        </p>
      )}
      {unlocked && (access.unlimited === "lifetime" || access.unlimited === "legacy_lifetime") && (
        <p className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-2 text-xs text-muted-2">
          <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-hover">
            Accès à vie actif
          </span>
        </p>
      )}
      {unlocked && access.conciergerie && (
        <div className="mx-auto mt-10 max-w-xl text-center text-xs text-muted-2">
          <p className="flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-hover">
              Conciergerie — analyses mensuelles restantes : {access.conciergerie.remaining}/{access.conciergerie.quota}
            </span>
            {access.conciergerie.extraRemaining > 0 && (
              <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 font-medium text-foreground">
                Analyses supplémentaires : {access.conciergerie.extraRemaining}
              </span>
            )}
            {access.hasManageableSubscription && <ManageSubscriptionLink analysisId={id} />}
          </p>
          {addonAvailable && access.conciergerie.canBuyAddon && !access.unlimited && (
            <div className="mt-4">
              <BuyAddonButton analysisId={id} />
            </div>
          )}
        </div>
      )}

      {/* Free-trial link (/analyze?promo=<code>, see api/analyze/route.ts):
          unlocked for free, no payment -- once they've seen the full
          report, propose Lifetime as the natural next step. Never shown
          to a real Plus/Lifetime subscriber (nothing to upsell there). */}
      {unlocked && analysis.promo_code && !isDirectLinkReport(analysis.email) && !access.unlimited && !access.conciergerie && (
        <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-accent/30 bg-accent-soft px-5 py-4 text-center">
          <p className="text-sm font-medium text-accent-hover">
            🎁 Cette analyse t&apos;a été offerte par {BRAND_NAME}.
          </p>
          <p className="mt-1 text-sm text-muted">
            Envie d&apos;un accès illimité et à vie à toutes tes prochaines analyses ?
          </p>
          <a
            href="/pricing"
            className="mt-3 inline-block text-sm font-semibold text-accent-hover underline underline-offset-2"
          >
            Découvrir l&apos;accès à vie →
          </a>
        </div>
      )}

      {unlocked && (
        <p className="mx-auto mt-14 max-w-xl text-center text-xs leading-relaxed text-muted-2">
          {analysis.result.disclaimer}
        </p>
      )}
    </div>
  );
}
