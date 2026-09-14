// Shared, client-safe pricing copy -- no prices are computed here beyond
// the two existing fixed offers (never changed by this feature). Lifetime
// has no hardcoded price: its label is fetched server-side from Stripe
// (see lib/lifetimePrice.ts) and passed in wherever it's rendered.

export interface PlanContent {
  id: "one_time" | "plus" | "lifetime";
  name: string;
  description: string;
  priceLabel: string;
  period?: string;
  features: string[];
  badge?: string;
  note: string;
  concierge?: string;
}

export const ONE_TIME_PLAN: PlanContent = {
  id: "one_time",
  name: "Analyse unique",
  description: "Pour optimiser une annonce maintenant.",
  priceLabel: "4,90 €",
  features: ["Analyse complète", "Recommandations prioritaires", "Titres et description", "1 re-test après correction"],
  note: "Paiement unique",
};

export const PLUS_PLAN: PlanContent = {
  id: "plus",
  name: "GuestMirror Plus",
  description: "Idéal si tu gères plusieurs annonces ou veux tester régulièrement tes améliorations.",
  priceLabel: "6,90 €",
  period: "/ mois",
  features: ["Plusieurs analyses", "Comparaisons A/B", "Re-tests", "Historique", "Plusieurs annonces"],
  badge: "Recommandé",
  note: "Annulable à tout moment",
  concierge: "Idéal pour les conciergeries et multi-propriétaires",
};

export const LIFETIME_PLAN_BASE: Omit<PlanContent, "priceLabel"> = {
  id: "lifetime",
  name: "GuestMirror Lifetime",
  description: "Accès complet, une fois pour toutes. Offre de lancement, disponibilité limitée.",
  features: ["Accès complet à vie", "Aucun abonnement", "Mêmes avantages que GuestMirror Plus"],
  note: "Paiement unique • Accès à vie",
};
