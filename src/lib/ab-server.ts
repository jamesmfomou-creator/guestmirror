import { cookies } from "next/headers";
import { AB_COOKIE_NAME, AbVariant } from "@/lib/ab";
import { EXPERIMENT_FREEZE } from "@/lib/experimentFreeze";

/**
 * Server-component counterpart to lib/ab.ts's getAbVariant(). Kept in a
 * separate module since next/headers can't be imported from code that's
 * also pulled into a client bundle (lib/ab.ts is imported by
 * AnalyzeWizard.tsx and lib/analytics.ts, both client-side).
 */
export async function getAbVariantServer(): Promise<AbVariant> {
  if (EXPERIMENT_FREEZE.active) return EXPERIMENT_FREEZE.ab;
  const store = await cookies();
  const value = store.get(AB_COOKIE_NAME)?.value;
  return value === "A" || value === "B" ? value : "A";
}
