import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnalysis } from "@/lib/store";
import { resolveImageUrls } from "@/lib/images";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { ScoreHeader } from "@/components/result/ScoreHeader";
import { FirstHesitation } from "@/components/result/FirstHesitation";
import { MainProblem } from "@/components/result/MainProblem";
import { LockedTeaser } from "@/components/result/LockedTeaser";
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
import { lockedRecommendationCount } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/brand";

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
  const unlocked = analysis.is_unlocked;

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

      <ScoreHeader result={analysis.result} locked={!unlocked} />

      {!unlocked && (
        <>
          <FirstHesitation result={analysis.result} />
          <AnalyticsBeacon event="main_problem_viewed" props={{ analysisId: id }} />
          <MainProblem result={analysis.result} />
          <LockedTeaser count={lockedRecommendationCount(analysis.result)} />
          <Paywall analysisId={id} canceled={sp.canceled === "1"} />
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

      {unlocked && (
        <p className="mx-auto mt-14 max-w-xl text-center text-xs leading-relaxed text-muted-2">
          {analysis.result.disclaimer}
        </p>
      )}
    </div>
  );
}
