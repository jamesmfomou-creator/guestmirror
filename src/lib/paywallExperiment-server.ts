import { cookies } from "next/headers";
import { PAYWALL_COOKIE_NAME, PaywallVariant, resolvePaywallVariant } from "@/lib/paywallExperiment";
import { EXPERIMENT_FREEZE } from "@/lib/experimentFreeze";

/**
 * Server-component counterpart to getPaywallVariant(). Separate module for
 * the same reason as lib/ab-server.ts: next/headers cannot be pulled into a
 * client bundle.
 */
export async function getPaywallVariantServer(): Promise<PaywallVariant> {
  if (EXPERIMENT_FREEZE.active) return EXPERIMENT_FREEZE.paywall;
  const store = await cookies();
  return resolvePaywallVariant(store.get(PAYWALL_COOKIE_NAME)?.value);
}
