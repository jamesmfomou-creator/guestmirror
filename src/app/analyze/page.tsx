import { Suspense } from "react";
import type { Metadata } from "next";
import { AnalyzeWizard } from "@/components/analyze/AnalyzeWizard";
import { currentIdentity } from "@/lib/access/session";

export const metadata: Metadata = {
  title: "Test des 5 secondes",
};

export default async function AnalyzePage() {
  // Logged in to Mon espace (code-verified, not a checkout-return session):
  // prefill the email step with that address.
  const identity = await currentIdentity();
  const knownEmail = identity && identity.scopeCheckoutSessionId === null ? identity.email : null;
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-5 py-12 sm:py-16" />}>
      <AnalyzeWizard knownEmail={knownEmail} />
    </Suspense>
  );
}
