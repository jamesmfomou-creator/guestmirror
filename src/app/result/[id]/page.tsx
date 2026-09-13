import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnalysis } from "@/lib/store";
import { resolveImageUrls } from "@/lib/images";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { verdictFor } from "@/lib/utils";
import { ScoreHeader } from "@/components/result/ScoreHeader";
import { FirstHesitation } from "@/components/result/FirstHesitation";
import { MainProblem } from "@/components/result/MainProblem";
import { LockedTeaser } from "@/components/result/LockedTeaser";
import { LockedPreviewB } from "@/components/result/LockedPreviewB";
import { AhaCoverImage } from "@/components/result/AhaCoverImage";
import { UnlockCtaGate } from "@/components/result/UnlockCtaGate";
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
import { getSubscriptionByEmail, isPlusActive } from "@/lib/subscriptions";
import { getAbVariantServer } from "@/lib/ab-server";
import { getInputMethodForAnalysis } from "@/lib/inputMethod";

export const metadata: Metadata = {
  title: `Ton ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ canceled?: string; unlocked?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const analysis = await getAnalysis(id);
  if (!analysis) notFound();

  const images = await resolveImageUrls(analysis.images);
  const subscription = await getSubscriptionByEmail(analysis.email);
  const plusActive = isPlusActive(subscription);
  const unlocked = analysis.is_unlocked || plusActive;
  const variant = await getAbVariantServer();
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

  const previous = analysis.previous_analysis_id
    ? await getAnalysis(analysis.previous_analysis_id)
    : null;

  return (
    <div className="px-5 pb-24 pt-12 sm:pt-16">
      {unlocked && sp.unlocked === "1" && (
        <AnalyticsBeacon event="purchase_completed" props={{ analysisId: id }} />
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

      <ScoreHeader result={analysis.result} locked={!unlocked} />

      {!unlocked && variant === "A" && (
        <>
          <FirstHesitation result={analysis.result} />
          <MainProblem result={analysis.result} analysisId={id} />
          <LockedTeaser count={lockedRecommendationCount(analysis.result)} analysisId={id} />
          <Paywall analysisId={id} canceled={sp.canceled === "1"} overallScore={analysis.overall_score} inputMethod={resultInputMethod} />
          <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed text-muted-2">
            {analysis.result.disclaimer}
          </p>
          <ShareCardVerdict score={analysis.overall_score} />
        </>
      )}

      {!unlocked && variant === "B" && (
        <>
          <FirstHesitation result={analysis.result} />
          <MainProblem result={analysis.result} analysisId={id} />
          <LockedPreviewB
            analysisId={id}
            otherImageUrls={images.slice(1)}
            suggestedTitle={analysis.result.title_analysis?.suggested_titles?.[0] ?? null}
            improvedDescription={analysis.result.description_analysis?.improved_description ?? null}
            topAction={analysis.result.action_plan?.[0] ?? null}
            count={lockedRecommendationCount(analysis.result)}
          />
          <UnlockCtaGate analysisId={id}>
            <Paywall analysisId={id} canceled={sp.canceled === "1"} overallScore={analysis.overall_score} inputMethod={resultInputMethod} />
          </UnlockCtaGate>
          <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed text-muted-2">
            {analysis.result.disclaimer}
          </p>
          <ShareCardVerdict score={analysis.overall_score} />
        </>
      )}

      {unlocked && (
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

      {unlocked && plusActive && analysis.email && (
        <p className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-2 text-xs text-muted-2">
          <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-hover">
            GuestMirror Plus actif
          </span>
          <ManageSubscriptionLink email={analysis.email} />
        </p>
      )}

      {unlocked && (
        <p className="mx-auto mt-14 max-w-xl text-center text-xs leading-relaxed text-muted-2">
          {analysis.result.disclaimer}
        </p>
      )}
    </div>
  );
}
