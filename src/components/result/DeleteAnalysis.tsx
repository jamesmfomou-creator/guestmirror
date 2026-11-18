"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { editTokenFor } from "@/lib/analysisOwnership";
import { EDIT_TOKEN_HEADER_NAME } from "@/lib/analysisEditTokenHeader";
import { useCanEditAnalysis } from "./useCanEditAnalysis";

// Only offered to the browser that created the analysis, or to a visitor
// who verified the report's email (the server checks the same thing).
export function DeleteAnalysis({ analysisId, serverAllowed = false }: { analysisId: string; serverAllowed?: boolean }) {
  const router = useRouter();
  const canEdit = useCanEditAnalysis(analysisId, serverAllowed);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!canEdit) return null;

  async function handleDelete() {
    setLoading(true);
    setFailed(false);
    try {
      const token = editTokenFor(analysisId);
      const res = await fetch(`/api/analyses/${analysisId}`, {
        method: "DELETE",
        headers: token ? { [EDIT_TOKEN_HEADER_NAME]: token } : {},
      });
      if (res.ok) router.push("/");
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-14 max-w-2xl text-center">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-2 hover:text-score-low"
        >
          <Trash2 size={13} />
          Supprimer cette analyse
        </button>
      ) : (
        <div className="inline-flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-4">
          <p className="text-sm text-foreground">
            Supprimer définitivement cette analyse et ses captures ?
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="rounded-full bg-score-low px-4 py-1.5 text-xs font-medium text-white"
            >
              {loading ? "Suppression…" : "Confirmer"}
            </button>
          </div>
          {failed && <p className="text-xs text-score-low">La suppression n&apos;a pas fonctionné.</p>}
        </div>
      )}
    </div>
  );
}
