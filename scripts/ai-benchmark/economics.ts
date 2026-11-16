// Unit economics of an analysis, as formulas. Every input is a parameter:
// nothing here is a measured business figure. The benchmark fills in the
// token counts it measured; fees, VAT and exchange rate must come from the
// Stripe dashboard / the accountant, not from this file.

export interface AiCostInputs {
  inputTokens: number;
  outputTokens: number;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

/** Cost of one model call. */
export function costPerCallUsd(i: AiCostInputs): number {
  return (i.inputTokens * i.inputUsdPerMTok + i.outputTokens * i.outputUsdPerMTok) / 1_000_000;
}

export interface AttemptInputs {
  costPerCallUsd: number;
  // Share of attempts that needed a second full model call (the app-level
  // retry on a malformed response). 0.06 = 6 %.
  retryRate: number;
  // Share of attempts that end with a stored, usable analysis.
  successRate: number;
  // Extra full attempts started per successful analysis because the visitor
  // pressed "Réessayer" on an analysis the server had in fact finished.
  // 0 once recovery by attempt id is live.
  duplicateAttemptsPerSuccess: number;
}

export interface AttemptEconomics {
  costPerAttemptUsd: number;
  costOfRetriesPerAttemptUsd: number;
  costPerSuccessfulAnalysisUsd: number;
  // Model spend on an attempt that yields nothing, averaged over failures.
  costPerFailedAttemptUsd: number;
  costPer100AnalysesUsd: number;
  costPer1000AnalysesUsd: number;
}

export function attemptEconomics(a: AttemptInputs): AttemptEconomics {
  if (a.successRate <= 0 || a.successRate > 1) throw new Error("successRate must be in (0, 1]");
  const costPerAttemptUsd = a.costPerCallUsd * (1 + a.retryRate);
  const costPerSuccessfulAnalysisUsd = (costPerAttemptUsd / a.successRate) * (1 + a.duplicateAttemptsPerSuccess);
  return {
    costPerAttemptUsd,
    costOfRetriesPerAttemptUsd: a.costPerCallUsd * a.retryRate,
    costPerSuccessfulAnalysisUsd,
    costPerFailedAttemptUsd: costPerAttemptUsd,
    costPer100AnalysesUsd: costPerSuccessfulAnalysisUsd * 100,
    costPer1000AnalysesUsd: costPerSuccessfulAnalysisUsd * 1000,
  };
}

export interface SaleInputs {
  priceEur: number; // 4.90
  // Payment fees, kept separate from everything else.
  paymentFeePercent: number; // e.g. 0.015
  paymentFeeFixedEur: number; // e.g. 0.25
  // VAT included in the price, 0 if not applicable. 0.20 = 20 %.
  vatRate: number;
  usdToEur: number;
  costPerSuccessfulAnalysisUsd: number;
  // Free analyses run for each sale (completed analyses / payments).
  analysesPerSale: number;
}

export interface SaleEconomics {
  revenueExVatEur: number;
  paymentFeesEur: number;
  // The paid analysis itself.
  aiCostOfSoldAnalysisEur: number;
  // The free analyses that did not convert, attributed to this sale.
  aiCostOfFreeAnalysesEur: number;
  marginBeforeAcquisitionEur: number;
  marginRate: number;
}

export function saleEconomics(s: SaleInputs): SaleEconomics {
  const revenueExVatEur = s.priceEur / (1 + s.vatRate);
  const paymentFeesEur = s.priceEur * s.paymentFeePercent + s.paymentFeeFixedEur;
  const perAnalysisEur = s.costPerSuccessfulAnalysisUsd * s.usdToEur;
  const aiCostOfSoldAnalysisEur = perAnalysisEur;
  const aiCostOfFreeAnalysesEur = perAnalysisEur * Math.max(0, s.analysesPerSale - 1);
  const marginBeforeAcquisitionEur = revenueExVatEur - paymentFeesEur - aiCostOfSoldAnalysisEur - aiCostOfFreeAnalysesEur;
  return {
    revenueExVatEur,
    paymentFeesEur,
    aiCostOfSoldAnalysisEur,
    aiCostOfFreeAnalysesEur,
    marginBeforeAcquisitionEur,
    marginRate: marginBeforeAcquisitionEur / revenueExVatEur,
  };
}
