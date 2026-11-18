"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { track } from "@/lib/analytics";
import { EmailCodeVerify } from "@/components/access/EmailCodeVerify";
import { useCanEditAnalysis } from "./useCanEditAnalysis";

// For the owner of a report on a browser that cannot change it yet (another
// device, or a report created before edit tokens): verifying the report's
// email -- the code goes to that address, never to a typed one -- restores
// "Supprimer" and "Compléter la fiche". The id alone never does.

export function OwnershipVerify({
  analysisId,
  maskedEmail,
  serverAllowed,
}: {
  analysisId: string;
  maskedEmail: string;
  serverAllowed: boolean;
}) {
  const router = useRouter();
  const canEdit = useCanEditAnalysis(analysisId, serverAllowed);
  if (canEdit) return null;

  return (
    <div className="mx-auto mt-14 max-w-xl rounded-[var(--radius-lg)] border border-border bg-card px-4 py-4 text-left sm:px-5">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
        <ShieldCheck aria-hidden size={15} className="shrink-0 text-muted" />
        Ce rapport est à toi ?
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Pour le supprimer ou compléter la fiche de ton logement depuis cet appareil, confirme ton adresse ({maskedEmail}) avec
        le code que l&apos;on t&apos;envoie.
      </p>
      <div className="mt-3">
        <EmailCodeVerify
          requestBody={{ analysisId, purpose: "ownership" }}
          verifyBody={(code) => ({ analysisId, code })}
          requestLabel="Recevoir mon code"
          onVerified={() => {
            track("access_verified", { analysisId, purpose: "ownership" });
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
