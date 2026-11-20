// What the AI actually saw of a listing's photos, and how honest the report
// must be about it.
//
// Production audit (2026-11-20): link imports only ever send the FIRST 5
// photos of the gallery (lib/airbnbExtract.ts MAX_ANALYZED_PHOTOS), yet the
// model was told "voici 5 captures d'écran de l'annonce" with no idea the
// gallery held more. 74 % of those analyses then reproached the host for
// rooms "not shown" (bedroom, bathroom...) that were simply beyond photo 5.
//
// This module is the single source of truth for that coverage:
//  - built once per analysis (link import or screenshots), passed to the
//    prompt (coveragePromptBlock) and stored on the report (photo_coverage);
//  - hedgeUnverifiedAbsences() is the deterministic backstop: when coverage
//    is partial, any weakness / priority / action that still asserts a room
//    or space is ABSENT is rewritten as "à vérifier", downgraded to low
//    severity and moved out of first place, so it can never become the free
//    point or the n°1 priority;
//  - coverageNote() is the one line the result page shows.
// Pure functions only: everything here is unit-tested.

import type { AnalysisResult } from "@/lib/types";

export type PhotoSource = "airbnb_url" | "screenshots" | "mixed";

export interface PhotoCoverage {
  source: PhotoSource;
  /** Photos actually sent to the model. */
  sent: number;
  /** Photos the listing publishes in its public data (link import); null = unknown (screenshots, OG fallback). */
  galleryTotal: number | null;
  /** 1-based gallery positions of the photos sent (link import); null for screenshots. */
  positions: number[] | null;
  /** True only when every published photo was sent: the only case where an absence can be stated. */
  complete: boolean;
  /** The gallery count comes from public data not known to be exhaustive: read it as "at least". */
  countIsMinimum?: boolean;
}

/**
 * Whether the photo list in Airbnb's public data (JSON-LD) is known to be the
 * WHOLE gallery. Not verified yet: it may list only part of it. Until
 * production logs (photos_available on analysis_server_completed) show it
 * matches real gallery sizes, a link import is never declared complete and
 * its photo count is shown as a minimum ("au moins N"). Flip only on evidence.
 */
export const GALLERY_COUNT_VERIFIED = false;

/**
 * Link import. `galleryTotal` = photos found in the listing's public data
 * (null when only the Open Graph cover was available); `downloaded[i]` says
 * whether the i-th SELECTED photo (gallery position i + 1) could be fetched.
 */
export function buildUrlCoverage(galleryTotal: number | null, downloaded: boolean[], countVerified = GALLERY_COUNT_VERIFIED): PhotoCoverage {
  const positions = downloaded.flatMap((ok, i) => (ok ? [i + 1] : []));
  const total = galleryTotal !== null && galleryTotal > 0 ? galleryTotal : null;
  return {
    source: "airbnb_url",
    sent: positions.length,
    galleryTotal: total,
    positions,
    complete: countVerified && total !== null && positions.length === total,
    ...(countVerified ? {} : { countIsMinimum: true }),
  };
}

/** Screenshots uploaded by the visitor: we never know whether they cover the whole listing. */
export function screenshotCoverage(count: number, withLink = false): PhotoCoverage {
  return { source: withLink ? "mixed" : "screenshots", sent: count, galleryTotal: null, positions: null, complete: false };
}

function isContiguousFromOne(positions: number[]): boolean {
  return positions.every((p, i) => p === i + 1);
}

/** How the photos sent are described, in French ("les 5 premières photos de ta galerie (sur 28 publiées)"). */
export function describeSentPhotos(c: PhotoCoverage): string {
  if (c.source !== "airbnb_url") {
    return c.sent === 1 ? "la capture que tu as importée" : `les ${c.sent} captures que tu as importées`;
  }
  const total =
    c.galleryTotal === null || (c.countIsMinimum && c.galleryTotal <= c.sent)
      ? ""
      : c.countIsMinimum
        ? ` (qui en compte au moins ${c.galleryTotal})`
        : ` (sur ${c.galleryTotal} publiées)`;
  if (c.complete) return c.sent === 1 ? "l'unique photo de ta galerie" : `les ${c.sent} photos de ta galerie`;
  if (c.positions && isContiguousFromOne(c.positions)) {
    return c.sent === 1 ? `la première photo de ta galerie${total}` : `les ${c.sent} premières photos de ta galerie${total}`;
  }
  const list = (c.positions ?? []).map((p) => `n°${p}`).join(", ");
  return `${c.sent} photo${c.sent > 1 ? "s" : ""} de ta galerie (${list})${total}`;
}

/** Block inserted in the user message, right before the images. */
export function coveragePromptBlock(c: PhotoCoverage): string {
  if (c.source === "airbnb_url") {
    const order = c.positions && c.positions.length ? ` Positions dans la galerie, dans l'ordre où tu les reçois : ${c.positions.map((p) => `n°${p}`).join(", ")}.` : "";
    if (c.complete) {
      return `COUVERTURE DES PHOTOS : galerie COMPLÈTE. Tu reçois les ${c.sent} photos publiées par l'annonce, dans l'ordre de la galerie Airbnb.${order} Tu peux constater qu'un espace n'est montré dans aucune photo.`;
    }
    const total =
      c.galleryTotal === null
        ? "Le nombre total de photos de la galerie est inconnu"
        : c.countIsMinimum
          ? `Les données publiques de l'annonce listent ${c.galleryTotal} photo${c.galleryTotal > 1 ? "s" : ""}, mais la galerie réelle peut en contenir davantage`
          : `La galerie publie ${c.galleryTotal} photos au total`;
    return `COUVERTURE DES PHOTOS : galerie PARTIELLE. Tu reçois ${c.sent} photo${c.sent > 1 ? "s" : ""} extraite${c.sent > 1 ? "s" : ""} automatiquement de l'annonce, dans l'ordre de la galerie Airbnb (ce sont les premières que voit un voyageur). ${total} : tu ne vois PAS les autres.${order} Un espace absent de ces photos peut très bien figurer plus loin dans la galerie : ne le présente jamais comme absent de l'annonce.`;
  }
  return `COUVERTURE DES PHOTOS : ${c.sent} capture${c.sent > 1 ? "s" : ""} d'écran importée${c.sent > 1 ? "s" : ""} par le propriétaire, dans l'ordre où il les a fournies. Elles peuvent ne montrer qu'une partie de l'annonce : un espace absent de ces captures n'est pas forcément absent de l'annonce.`;
}

/** One line for the result page ("Analyse réalisée sur …"). Null when the report predates this field. */
export function coverageNote(c: PhotoCoverage | null | undefined): string | null {
  if (!c || !Number.isFinite(c.sent) || c.sent <= 0) return null;
  const text = c.source === "screenshots" ? "" : c.source === "mixed" ? ", plus le lien de l'annonce" : ", plus le titre et la description";
  return `Analyse réalisée sur ${describeSentPhotos(c)}${text}.`;
}

// ---------------------------------------------------------------------------
// Backstop: absence claims that the model still stated as facts.

const SPACE = "(chambres?|salles? de bains?|salles? d.eau|toilettes|wc|cuisines?|coin cuisine|extérieurs?|jardins?|terrasses?|balcons?|piscines?|spa|jacuzzi|séjour|salon|façade|entrée|espaces?|pièces?|lits?|couchages?|vue d.ensemble|quartier|parking|dressing|bureau)";
const ABSENCE = new RegExp(
  [
    `(aucune?|pas de|pas une seule|absence (de|d.)|manque (de |d.)?|sans|ni) (photo|image|vue|visuel|cliché)s?[^.]{0,40}${SPACE}`,
    `(ne|n.)\\s?(montre|montrent|présente|présentent|voit|vois|apparai[sî]t|apparaissent|figure|figurent)[^.]{0,20}(pas|aucune?|rien|nulle part|jamais)[^.]{0,40}${SPACE}`,
    `${SPACE}[^.]{0,40}(n.est|ne sont|n.apparai[sî]t|n.apparaissent|ne figure|ne figurent)[^.]{0,12}(pas|jamais|nulle part)`,
    `${SPACE}[^.]{0,25}(absente?s?|manquante?s?|invisibles?|non montrée?s?|pas montrée?s?)`,
    `(rien ne montre|aucune trace|on ne voit (pas|aucune?|jamais))[^.]{0,40}${SPACE}`,
  ].join("|"),
  "i"
);
// Already honest about the sample: leave as is.
const HEDGED = /(photos? (analysées|transmises|reçues|fournies|extraites|que j.ai (reçues|vues))|premières photos|dans (cet|l.)échantillon|parmi (les|ces) \d+|captures? (importées|fournies|reçues)|à vérifier|vérifie (qu|si|que)|plus loin dans (ta|la) galerie)/i;

export function isUnverifiedAbsenceClaim(text: string): boolean {
  return ABSENCE.test(text) && !HEDGED.test(text);
}

// An action-plan step like "Ajouter une photo de la salle de bain" implies the
// space is missing. Steps are shown bare (no explanation around them), so on a
// partial gallery they get the same "à vérifier" note.
const ADD_PHOTO_OF_SPACE = new RegExp(`(ajoute|ajouter|ajoutez|intègre|intégrer|rajoute|rajouter)[^.]{0,20}(photos?|images?|vues?|clichés?)[^.]{0,30}${SPACE}`, "i");
function isUnverifiedAbsenceStep(step: string): boolean {
  return isUnverifiedAbsenceClaim(step) || (ADD_PHOTO_OF_SPACE.test(step) && !HEDGED.test(step));
}

const PREFIX = "À vérifier : ";
function hedgeTitle(t: string): string {
  return t.startsWith(PREFIX) ? t : PREFIX + t.charAt(0).toLowerCase() + t.slice(1);
}
function hedgeNote(c: PhotoCoverage): string {
  return ` (Je n'ai vu que ${describeSentPhotos(c)} : vérifie que cet espace figure bien plus loin dans ta galerie Airbnb avant de le considérer comme absent.)`;
}

/**
 * When coverage is partial, rewrites every unverified absence claim as "à
 * vérifier" (severity low, note appended, moved after the other items).
 * Never drops content, never touches a complete-gallery report. Returns the
 * number of items hedged, for observability.
 */
export function hedgeUnverifiedAbsences<T extends Partial<AnalysisResult>>(result: T, c: PhotoCoverage): { result: T; hedged: number } {
  if (c.complete) return { result, hedged: 0 };
  let hedged = 0;
  const note = hedgeNote(c);

  const weaknesses = Array.isArray(result.weaknesses) ? result.weaknesses : [];
  const keptW: typeof weaknesses = [];
  const movedW: typeof weaknesses = [];
  for (const w of weaknesses) {
    if (w && typeof w === "object" && isUnverifiedAbsenceClaim(`${w.title ?? ""} ${w.explanation ?? ""}`)) {
      hedged++;
      movedW.push({ ...w, title: hedgeTitle(String(w.title ?? "")), severity: "low", explanation: `${w.explanation ?? ""}${note}`.trim() });
    } else keptW.push(w);
  }

  const priorities = Array.isArray(result.top_priorities) ? result.top_priorities : [];
  const keptP: typeof priorities = [];
  const movedP: typeof priorities = [];
  for (const p of priorities) {
    if (p && typeof p === "object" && isUnverifiedAbsenceClaim(`${p.title ?? ""} ${p.current_issue ?? ""}`)) {
      hedged++;
      movedP.push({ ...p, title: hedgeTitle(String(p.title ?? "")), current_issue: `${p.current_issue ?? ""}${note}`.trim() });
    } else keptP.push(p);
  }
  const reranked = [...keptP, ...movedP].map((p, i) => (p && typeof p === "object" && "rank" in p ? { ...p, rank: i + 1 } : p));

  const plan = Array.isArray(result.action_plan) ? result.action_plan : [];
  const planOut = plan.map((step) => {
    if (typeof step === "string" && isUnverifiedAbsenceStep(step)) {
      hedged++;
      return `${step.replace(/\s*\.?\s*$/, "")} (à vérifier dans ta galerie complète).`;
    }
    return step;
  });

  if (hedged === 0) return { result, hedged: 0 };
  return {
    result: {
      ...result,
      ...(Array.isArray(result.weaknesses) ? { weaknesses: [...keptW, ...movedW] } : {}),
      ...(Array.isArray(result.top_priorities) ? { top_priorities: reranked } : {}),
      ...(Array.isArray(result.action_plan) ? { action_plan: planOut } : {}),
    },
    hedged,
  };
}
