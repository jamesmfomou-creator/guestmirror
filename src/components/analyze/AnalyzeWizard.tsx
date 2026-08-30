"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StepImport } from "./StepImport";
import { StepEmail } from "./StepEmail";
import { StepAnalyzing } from "./StepAnalyzing";
import { PendingImage, fileToBase64 } from "@/lib/files";
import { track } from "@/lib/analytics";
import { takePendingFiles } from "@/lib/pendingUpload";
import { BRAND_NAME } from "@/lib/brand";
import { verdictFor } from "@/lib/utils";

type Step = "import" | "email" | "analyzing";

const MAX_IMAGES = 10;
const MIN_ANIMATION_MS = 3400;

function genId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function AnalyzeWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("import");
  const [url, setUrl] = useState(() => searchParams.get("url") || "");
  const [images, setImages] = useState<PendingImage[]>(() => {
    const pending = takePendingFiles();
    if (!pending || pending.length === 0) return [];
    return pending.map((file) => ({
      id: genId(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
  });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const startedAt = useRef<number | null>(null);

  const previousAnalysisId = searchParams.get("previous");

  function handleAddFiles(files: FileList) {
    const remaining = MAX_IMAGES - images.length;
    const toAdd = Array.from(files).slice(0, remaining);
    setError(null);
    if (images.length === 0 && toAdd.length > 0) track("upload_started");
    const next: PendingImage[] = toAdd.map((file) => ({
      id: genId(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...next]);
  }

  function handleRemoveImage(id: string) {
    setImages((prev) => prev.filter((i) => i.id !== id));
  }

  function goToEmail() {
    track("upload_completed", { image_count: images.length, hasUrl: url.trim().length > 0 });
    setStep("email");
  }

  async function runAnalysis() {
    setSubmitting(true);
    setAnalysisDone(false);
    track("email_submitted", { email: email.trim() });
    setStep("analyzing");
    startedAt.current = Date.now();
    track("analysis_started", { image_count: images.length, has_listing_url: url.trim().length > 0 });

    try {
      const encodedImages = await Promise.all(
        images.map(async (img) => {
          const { base64, mediaType } = await fileToBase64(img.file);
          return { base64, mediaType };
        })
      );

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_url: url.trim() || null,
          email: email.trim(),
          city: null,
          property_type: null,
          guest_capacity: null,
          nightly_price: null,
          images: encodedImages,
          previous_analysis_id: previousAnalysisId || null,
        }),
      });

      let json: { id?: string; overall_score?: number; error?: string };
      try {
        json = await res.json();
      } catch {
        throw new Error(
          "Une erreur est survenue. Essaie avec des captures moins nombreuses ou plus légères."
        );
      }
      if (!res.ok) {
        throw new Error(json.error || "Une erreur est survenue. Merci de réessayer.");
      }

      setAnalysisDone(true);
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      const wait = Math.max(MIN_ANIMATION_MS - elapsed, 700);
      setTimeout(() => {
        track("analysis_completed", {
          analysisId: json.id,
          overall_score: json.overall_score,
          verdict: json.overall_score != null ? verdictFor(json.overall_score).short : undefined,
          image_count: images.length,
          has_listing_url: url.trim().length > 0,
        });
        if (previousAnalysisId) track("rescan_completed");
        router.push(`/result/${json.id}`);
      }, wait);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setSubmitting(false);
      setStep("email");
    }
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-12 sm:py-16">
      {previousAnalysisId && step !== "analyzing" && (
        <div className="mb-6 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-hover">
          Nouvelle analyse après modifications — on comparera ton nouveau {BRAND_NAME} à
          l&apos;ancien.
        </div>
      )}
      {step === "import" && (
        <StepImport
          url={url}
          onUrlChange={setUrl}
          images={images}
          onAddFiles={handleAddFiles}
          onRemoveImage={handleRemoveImage}
          onContinue={goToEmail}
          canContinue={url.trim().length > 0 || images.length > 0}
          error={error || apiError}
        />
      )}
      {step === "email" && (
        <StepEmail
          email={email}
          onChange={setEmail}
          onSubmit={runAnalysis}
          loading={submitting}
          error={apiError}
        />
      )}
      {step === "analyzing" && <StepAnalyzing done={analysisDone} />}
    </div>
  );
}
