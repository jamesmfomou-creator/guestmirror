import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnalysis } from "@/lib/store";
import { resolveImageUrls } from "@/lib/images";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { verdictFor } from "@/lib/utils";
import { ScoreHeader } from "@/components/result/ScoreHeader";
import { FirstHesitation } from "@/components/result/FirstHesitation";
import { MainProblem } from "@/components/result/MainProblem";
import { FreeRecommendation } from "@/components/result/FreeRecommendation";
import { LockedTeaser } from "@/components/result/LockedTeaser";
import { LockedPreviewB } from "@/components/result/LockedPreviewB";
import { AhaCoverImage } from "@/components/result/AhaCoverImage";
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
import { lockedRecommendationCount } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/brand";
import { getAccessForEmail } from "@/lib/access/reportAccess";
import { AccessPanel } from "@/components/result/AccessPanel";
import { PaymentPending } from "@/components/result/PaymentPending";
import type { FeedbackPlan } from "@/lib/feedback";
import { getAbVariantServer } from "@/lib/ab-server";
import { getInputMethodForAnalysis } from "@/lib/inputMethod";
import { PostPurchaseFeedback } from "@/components/result/PostPurchaseFeedback";
import { IncompleteResultNotice } from "@/components/result/IncompleteResultNotice";
import { isIncompleteResult } from "@/lib/resultShape";
import { getPaywallVariantServer } from "@/lib/paywallExperiment-server";
import { buildPaywallPreview } from "@/lib/paywallPreview";
import { EMAIL_CONFIGURED } from "@/lib/env";

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
  const variant = await getAbVariantServer();
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

  const previous = analysis.previous_analysis_id
    ? await getAnalysis(analysis.previous_analysis_id)
    : null;

  return (
    <div className="px-5 pb-24 pt-12 sm:pt-16">
      {unlocked && sp.unlocked === "1" && (
        <AnalyticsBeacon event="purchase_completed" props={{ analysisId: id }} />
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

      {!unlocked && variant === "B" && <AhaCoverImage imageUrl={images[0]} />}

      {!unlocked && variant === "B" && (
        <h1 className="mx-auto max-w-md text-balance text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Ton diagnostic Airbnb est prêt
        </h1>
      )}

      <ScoreHeader
        result={analysis.result}
        locked={!unlocked}
        shortSummary={variant === "B"}
        hideBreakdown={incomplete}
      />

      {incomplete && (
        <IncompleteResultNotice
          listingUrl={analysis.listing_url}
          unlocked={unlocked}
          canRerunUnlocked={access.unlimited !== null || access.conciergerie?.usable === true}
        />
      )}

      {!unlocked && !incomplete && sp.checkout === "success" && <PaymentPending />}
      {!unlocked && !incomplete && sp.checkout !== "success" && access.needsVerification && (
        <AccessPanel mode="verify" analysisId={id} />
      )}
      {!unlocked && !incomplete && access.conciergerie && (
        <AccessPanel
          mode="credit"
          analysisId={id}
          remaining={access.conciergerie.remaining}
          quota={access.conciergerie.quota}
          periodEnd={access.conciergerie.periodEnd}
          blockedReason={access.conciergerie.blockedReason}
          canManage={access.hasManageableSubscription}
        />
      )}

      {!unlocked && !incomplete && variant === "A" && (
        <>
          <FirstHesitation result={analysis.result} />
          <MainProblem issue={analysis.result.top_priorities[0]?.current_issue ?? null} analysisId={id} />
          <FreeRecommendation
            recommendation={analysis.result.top_priorities[0]?.recommended_change ?? null}
            analysisId={id}
            inputMethod={resultInputMethod}
            userType={analysis.user_type}
            propertyCountRange={analysis.property_count_range}
          />
          {paywallPreview ? (
            !creditUsable ? <Paywall analysisId={id} canceled={sp.canceled === "1"} overallScore={analysis.overall_score} inputMethod={resultInputMethod} userType={analysis.user_type} propertyCountRange={analysis.property_count_range} preview={paywallPreview} emailsReportLink={emailsReportLink} /> : null
          ) : (
            <>
              <LockedTeaser count={lockedRecommendationCount(analysis.result)} analysisId={id} />
              {!creditUsable && <Paywall analysisId={id} canceled={sp.canceled === "1"} overallScore={analysis.overall_score} inputMethod={resultInputMethod} userType={analysis.user_type} propertyCountRange={analysis.property_count_range} />}
            </>
          )}
          <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed text-muted-2">
            {analysis.result.disclaimer}
          </p>
          <ShareCardVerdict score={analysis.overall_score} />
        </>
      )}

      {!unlocked && !incomplete && variant === "B" && (
        <>
          {paywallPreview ? (
            !creditUsable ? <Paywall analysisId={id} canceled={sp.canceled === "1"} overallScore={analysis.overall_score} inputMethod={resultInputMethod} userType={analysis.user_type} propertyCountRange={analysis.property_count_range} preview={paywallPreview} emailsReportLink={emailsReportLink} /> : null
          ) : (
            <LockedPreviewB analysisId={id} count={lockedRecommendationCount(analysis.result)}>
              {!creditUsable && <Paywall analysisId={id} canceled={sp.canceled === "1"} overallScore={analysis.overall_score} inputMethod={resultInputMethod} userType={analysis.user_type} propertyCountRange={analysis.property_count_range} />}
            </LockedPreviewB>
          )}
          <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed text-muted-2">
            {analysis.result.disclaimer}
          </p>
          <ShareCardVerdict score={analysis.overall_score} />
        </>
      )}

      {/* Nothing below was produced for an incomplete analysis: empty
          sections and 0/100 verdicts would read as findings. */}
      {unlocked && incomplete && <DeleteAnalysis analysisId={id} />}

      {unlocked && !incomplete && (
        <>
          {previous && <BeforeAfter previous={previous.result} current={analysis.result} />}
          <FullPriorities result={analysis.result} />
          <StrengthsWeaknesses result={analysis.result} />
          <CoverPhotoImpact result={analysis.result} />
          <TitleSection result={analysis.result} />
          <DescriptionSection result={analysis.result} />
          <PhotoGrid result={analysis.result} images={images} />
          <GuestQuestions result={analysis.result} />
          <ActionPlan result={analysis.result} />
          {!analysis.city && !analysis.property_type && !analysis.guest_capacity && !analysis.nightly_price && (
            <OptionalInfoCard analysisId={id} />
          )}
          <RescanCTA analysisId={id} />
          <ShareCard result={analysis.result} />
          <DeleteAnalysis analysisId={id} />
        </>
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
        <p className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-2 text-xs text-muted-2">
          <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-hover">
            Conciergerie — {access.conciergerie.remaining} analyse{access.conciergerie.remaining > 1 ? "s" : ""} restante
            {access.conciergerie.remaining > 1 ? "s" : ""} ce mois-ci
          </span>
          {access.hasManageableSubscription && <ManageSubscriptionLink analysisId={id} />}
        </p>
      )}

      {/* Free-trial link (/analyze?promo=<code>, see api/analyze/route.ts):
          unlocked for free, no payment -- once they've seen the full
          report, propose Lifetime as the natural next step. Never shown
          to a real Plus/Lifetime subscriber (nothing to upsell there). */}
      {unlocked && analysis.promo_code && !access.unlimited && !access.conciergerie && (
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
