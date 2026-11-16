// Client-safe copy for the three offers (pricing v2, see lib/plans.ts for the
// amounts and Stripe prices). Every feature listed here must exist in the
// product: no fake urgency, no crossed-out prices, no counters.

import { OFFERS, formatEur, type OfferId } from "@/lib/plans";

export interface PlanContent {
  id: OfferId;
  name: string;
  description: string;
  priceLabel: string;
  period?: string;
  /** One line shown right under the price, e.g. "20 analyses par mois". */
  keyLine?: string;
  features: string[];
  badge?: string;
  note: string;
}

export const ONE_TIME_PLAN: PlanContent = {
  id: "one_time",
  name: OFFERS.one_time.name,
  description: "Pour découvrir ce qui freine ton annonce.",
  priceLabel: formatEur(OFFERS.one_time.amountEur),
  keyLine: "1 rapport complet",
  features: [
    "Score sur 100 et diagnostic détaillé",
    "Analyse des photos, du titre et de la description",
    "Points de friction identifiés",
    "Recommandations personnalisées",
    "Plan d'amélioration priorisé",
  ],
  note: "Paiement unique",
};

export const CONCIERGERIE_PLAN: PlanContent = {
  id: "conciergerie",
  name: OFFERS.conciergerie.name,
  description: "Pour optimiser plusieurs annonces chaque mois.",
  priceLabel: formatEur(OFFERS.conciergerie.amountEur),
  period: "/ mois",
  keyLine: `${OFFERS.conciergerie.quotaPerPeriod} analyses par mois`,
  features: [
    "Diagnostics complets",
    "Recommandations personnalisées",
    "Plusieurs annonces Airbnb",
    "Accès à tes rapports déjà débloqués",
  ],
  badge: "Pour les professionnels",
  note: "Renouvelées chaque mois, non cumulables • Résiliable à tout moment",
};

export const LIFETIME_PLAN: PlanContent = {
  id: "lifetime",
  name: OFFERS.lifetime.name,
  description: "Analyse tes annonces sans abonnement.",
  priceLabel: formatEur(OFFERS.lifetime.amountEur),
  period: "une seule fois",
  keyLine: "Analyses illimitées",
  features: ["Accès à vie", "Diagnostics détaillés illimités", "Recommandations personnalisées", "Aucun renouvellement automatique"],
  note: "Paiement unique • Aucun abonnement",
};

export const PLANS: PlanContent[] = [ONE_TIME_PLAN, CONCIERGERIE_PLAN, LIFETIME_PLAN];
