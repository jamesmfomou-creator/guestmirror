import { Suspense } from "react";
import type { Metadata } from "next";
import { AnalyzeWizard } from "@/components/analyze/AnalyzeWizard";

export const metadata: Metadata = {
  title: "Test des 5 secondes",
};

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-5 py-12 sm:py-16" />}>
      <AnalyzeWizard />
    </Suspense>
  );
}
