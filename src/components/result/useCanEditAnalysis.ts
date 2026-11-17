"use client";

import { useSyncExternalStore } from "react";
import { editTokenFor } from "@/lib/analysisOwnership";

const noop = () => () => {};

/**
 * Whether this browser may change the analysis: it holds the edit token
 * handed to the browser that created it, or the server already knows the
 * visitor verified the report's email (`serverAllowed`). The server checks
 * again on every request (api/analyses/[id]); this only decides what to show.
 * Hydration-safe: false on the server render, the real value on the client.
 */
export function useCanEditAnalysis(analysisId: string, serverAllowed: boolean): boolean {
  const hasToken = useSyncExternalStore(
    noop,
    () => editTokenFor(analysisId) !== null,
    () => false
  );
  return serverAllowed || hasToken;
}
