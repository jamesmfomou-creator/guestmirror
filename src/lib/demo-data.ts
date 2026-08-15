import { AnalysisResult } from "./types";
import { BRAND_NAME } from "./brand";

export const DEMO_LISTING_URL = "https://www.airbnb.fr/rooms/demo-123456";

export const DEMO_IMAGES = [
  "/demo-photos/photo-1.svg",
  "/demo-photos/photo-2.svg",
  "/demo-photos/photo-3.svg",
  "/demo-photos/photo-4.svg",
  "/demo-photos/photo-5.svg",
];

export const DEMO_RESULT: AnalysisResult = {
  overall_score: 43,
  summary:
    "Ton logement semble agréable, mais son meilleur atout n'est pas visible immédiatement. La photo de couverture et le titre ne montrent pas ce qui rend cette annonce différente des autres.",
  first_hesitation:
    "Le logement a l'air agréable, mais je ne vois pas encore pourquoi je choisirais celui-ci plutôt que les autres.",
  scores: {
    cover_photo: 38,
    photos: 52,
    title: 57,
    description: 74,
    offer_clarity: 62,
    visual_attractiveness: 54,
    traveler_confidence: 73,
  },
  five_second_scores: {
    visual_impact: 41,
    differentiation: 35,
    clarity: 66,
    perceived_value: 52,
    trust: 71,
    desirability: 48,
  },
  guest_questions: [
    "Est-ce que la terrasse est privée ou partagée ?",
    "Est-ce calme le soir, ou est-ce que ça donne sur une rue passante ?",
    "À quelle distance se trouve vraiment le Vieux-Port à pied ?",
    "Le check-in se fait-il avec l'hôte ou en autonomie ?",
  ],
  strengths: [
    {
      title: "La description répond aux questions essentielles",
      explanation:
        "Le voyageur trouve rapidement les informations sur la capacité d'accueil, les équipements principaux et l'accès au logement.",
    },
    {
      title: "Les avis et la présentation de l'hôte inspirent confiance",
      explanation:
        "Les éléments de réassurance visibles (règlement clair, communication) donnent une impression sérieuse.",
    },
    {
      title: "Le logement a un vrai potentiel visuel",
      explanation:
        "Plusieurs pièces ont un bon niveau de luminosité naturelle, ce qui est un atout à mieux exploiter en photo.",
    },
  ],
  weaknesses: [
    {
      title: "La photo de couverture manque d'impact",
      severity: "high",
      explanation:
        "La première image montre le salon depuis un angle plat, sans profondeur ni élément distinctif. En un coup d'œil, un voyageur ne perçoit pas ce qui rend ce logement unique.",
      recommendation:
        "Choisis une photo qui montre l'espace le plus impressionnant du logement (vue, terrasse, volume) avec un cadrage légèrement en contre-plongée pour donner de la profondeur.",
    },
    {
      title: "Le titre est trop générique",
      severity: "medium",
      explanation:
        "\"Superbe appartement au cœur de Marseille\" pourrait décrire des centaines d'annonces. Aucun bénéfice concret ou élément différenciant n'est mentionné.",
      recommendation:
        "Ajoute un élément concret et différenciant : vue, terrasse, proximité immédiate d'un lieu clé, ou ambiance particulière du logement.",
    },
    {
      title: "Le principal avantage apparaît trop tard",
      severity: "medium",
      explanation:
        "La terrasse avec vue, pourtant le point fort du logement, n'apparaît qu'en 5e photo et n'est mentionnée qu'au 3e paragraphe de la description.",
      recommendation:
        "Fais apparaître cet avantage dans les deux ou trois premières photos et dès la première phrase de la description.",
    },
    {
      title: "Encombrement visuel sur plusieurs photos",
      severity: "low",
      explanation:
        "Certaines photos incluent des objets personnels ou du désordre en arrière-plan qui détournent l'attention du logement lui-même.",
      recommendation:
        "Range les surfaces visibles avant chaque prise de vue et privilégie des angles qui excluent les zones encombrées.",
    },
    {
      title: "Manque de variation dans les angles de prise de vue",
      severity: "low",
      explanation:
        "La majorité des photos sont prises depuis la même hauteur et le même axe, ce qui donne une impression répétitive.",
      recommendation:
        "Varie les angles : plans larges pour montrer le volume, plans plus serrés pour mettre en valeur les détails qui comptent (literie, salle de bain, vue).",
    },
  ],
  top_priorities: [
    {
      rank: 1,
      title: "Ta photo de couverture manque d'impact",
      current_issue:
        "Ta terrasse semble être ton meilleur atout, mais elle n'apparaît qu'en photo n°5.",
      recommended_change:
        "Remplace-la par une photo lumineuse qui met en avant l'espace le plus différenciant (terrasse, vue, volume du salon).",
      expected_benefit:
        "Une meilleure première impression visuelle peut inciter davantage de voyageurs à ouvrir l'annonce.",
      score: 38,
    },
    {
      rank: 2,
      title: "Ton titre est trop générique",
      current_issue:
        "Le titre actuel ne se différencie pas des autres annonces similaires dans la même zone.",
      recommended_change:
        "Intègre un élément concret et unique à ton logement plutôt qu'un adjectif générique.",
      expected_benefit:
        "Un titre plus spécifique aide le voyageur à se projeter et à comprendre rapidement ce qui distingue ce logement.",
      score: 57,
    },
    {
      rank: 3,
      title: "Ton principal avantage apparaît trop tard",
      current_issue:
        "La terrasse avec vue, atout majeur du logement, est reléguée en 5e position dans les photos.",
      recommended_change:
        "Positionne cet atout parmi les 3 premières photos et mentionne-le dès la première ligne de la description.",
      expected_benefit:
        "Les voyageurs qui parcourent rapidement l'annonce ont plus de chances de repérer ce qui rend le logement intéressant.",
      score: 61,
    },
  ],
  title_analysis: {
    current_title: "Superbe appartement au cœur de Marseille",
    issues: [
      "Adjectif générique (\"superbe\") qui n'apporte aucune information concrète",
      "Aucun élément différenciant par rapport aux annonces voisines",
      "Ne mentionne pas l'atout principal du logement (la terrasse avec vue)",
    ],
    suggested_titles: [
      "Appartement lumineux avec terrasse et vue, proche du Vieux-Port",
      "T2 calme avec terrasse panoramique, à 5 min du Vieux-Port",
      "Terrasse avec vue, appartement rénové au cœur de Marseille",
    ],
  },
  description_analysis: {
    issues: [
      "Le principal atout (la terrasse) n'est mentionné qu'au 3e paragraphe",
      "Certaines phrases restent vagues (\"très agréable\", \"idéalement situé\") sans élément concret",
      "La structure manque de séparation claire entre les espaces, les équipements et les accès",
    ],
    missing_information: [
      "Distance à pied jusqu'aux transports en commun ou aux lieux clés",
      "Précision sur le type de literie dans chaque chambre",
      "Informations sur le check-in (autonome ou avec l'hôte)",
    ],
    improved_description:
      "Profitez d'une terrasse avec vue dégagée, en plein cœur de Marseille, à 5 minutes à pied du Vieux-Port.\n\nCet appartement rénové de 55 m² accueille jusqu'à 4 voyageurs dans un cadre lumineux et calme. La terrasse, orientée sud, est l'endroit idéal pour prendre le petit-déjeuner ou profiter des soirées d'été.\n\nL'espace de vie ouvert donne sur une cuisine entièrement équipée. Les deux chambres disposent chacune d'un lit double et d'un espace de rangement fermé.\n\nAccès autonome via boîte à clés, disponible 24h/24. Transports en commun à 3 minutes à pied, commerces et restaurants à proximité immédiate.\n\nUn logement pensé pour se sentir chez soi, avec les avantages d'un emplacement central.",
  },
  photo_analysis: [
    {
      image_index: 1,
      score: 44,
      strengths: ["Bonne luminosité naturelle"],
      weaknesses: ["Cadrage plat", "Ne montre pas l'atout principal du logement"],
      recommendation:
        "Remplacer par une photo qui montre la terrasse ou un angle plus large du salon avec de la profondeur.",
    },
    {
      image_index: 2,
      score: 82,
      strengths: ["Angle flatteur", "Espace bien rangé", "Belle lumière"],
      weaknesses: [],
      recommendation: "Cette photo fonctionne bien, elle peut être positionnée plus tôt dans l'ordre.",
    },
    {
      image_index: 3,
      score: 68,
      strengths: ["Montre clairement la chambre principale"],
      weaknesses: ["Légère surexposition près de la fenêtre"],
      recommendation: "Reprendre la photo en fin de journée pour équilibrer la lumière.",
    },
    {
      image_index: 4,
      score: 79,
      strengths: ["Met bien en valeur la cuisine équipée"],
      weaknesses: ["Un angle légèrement trop serré"],
      recommendation: "Prendre un peu de recul pour montrer l'ensemble de l'espace cuisine.",
    },
    {
      image_index: 5,
      score: 91,
      strengths: ["Terrasse avec vue, principal atout du logement", "Excellente lumière"],
      weaknesses: [],
      recommendation:
        "Cette photo devrait apparaître beaucoup plus tôt : c'est l'élément le plus différenciant de l'annonce.",
    },
  ],
  recommended_photo_order: [5, 2, 4, 3, 1],
  action_plan: [
    "Remplacer la photo de couverture par une image qui montre la terrasse ou un angle plus large et lumineux du salon",
    "Réorganiser les photos selon l'ordre recommandé pour montrer l'atout principal dès les premières images",
    "Mettre à jour le titre pour inclure la terrasse et la vue",
    "Réécrire l'introduction de la description pour mentionner l'atout principal dès la première phrase",
    "Ajouter les informations manquantes : distance aux transports, type de literie, modalités de check-in",
    "Ranger les surfaces visibles avant de reprendre les photos identifiées comme encombrées",
  ],
  disclaimer:
    `${BRAND_NAME} est une estimation produite à partir des éléments visibles de l'annonce. Il ne prédit ni ne garantit les clics ou les réservations.`,
};

export const DEMO_RESULT_AFTER: AnalysisResult = {
  ...DEMO_RESULT,
  overall_score: 81,
  summary:
    "Ton annonce montre désormais clairement ce qui rend ce logement différent dès les premières secondes. La présentation est nette, cohérente et rassurante.",
  first_hesitation:
    "Je vois maintenant tout de suite ce qui rend ce logement différent, avant même d'avoir lu la description.",
  scores: {
    cover_photo: 87,
    photos: 84,
    title: 81,
    description: 85,
    offer_clarity: 83,
    visual_attractiveness: 80,
    traveler_confidence: 84,
  },
  five_second_scores: {
    visual_impact: 85,
    differentiation: 79,
    clarity: 88,
    perceived_value: 81,
    trust: 86,
    desirability: 83,
  },
  guest_questions: [
    "Le canapé se déplie-t-il pour un couchage supplémentaire ?",
  ],
};

/** Two-listing demo dataset used by Compare Mode. */
export const DEMO_COMPARE_A: AnalysisResult = DEMO_RESULT_AFTER;

export const DEMO_COMPARE_B: AnalysisResult = {
  ...DEMO_RESULT,
  overall_score: 46,
  summary:
    "Ce logement a probablement des qualités, mais rien dans les premières secondes ne me donne envie d'en savoir plus.",
  first_hesitation: "Rien ne m'arrête assez longtemps pour avoir envie d'en voir plus.",
  scores: {
    cover_photo: 33,
    photos: 41,
    title: 52,
    description: 58,
    offer_clarity: 49,
    visual_attractiveness: 40,
    traveler_confidence: 55,
  },
  five_second_scores: {
    visual_impact: 30,
    differentiation: 28,
    clarity: 54,
    perceived_value: 39,
    trust: 57,
    desirability: 32,
  },
};

export const DEMO_COMPARE_IMAGES_A = DEMO_IMAGES;
export const DEMO_COMPARE_IMAGES_B = [DEMO_IMAGES[0], DEMO_IMAGES[2]];

/**
 * "Voir un exemple" shortcut on /compare: the same two real photos used in
 * the landing page's interactive teaser, with a matching fixed result. This
 * is a canned example only -- clicking "Comparer les deux annonces" while
 * it's loaded skips the API call entirely.
 */
export const COMPARE_EXAMPLE_IMAGES = {
  a: "/demo/annonce-a.jpg",
  b: "/demo/annonce-b.jpg",
};

export const COMPARE_EXAMPLE_RESULT = {
  a: { overall_score: 84 },
  b: { overall_score: 68 },
  comparison: {
    winner: "a" as const,
    why_winner: [
      "Les deux annonces sont attractives, mais A montre immédiatement l'expérience : terrasse, vue mer et détente. Sur B, l'atout extérieur est moins dominant au premier regard.",
    ],
    main_problem:
      "En quelques secondes, l'ouverture sur la mer — pourtant un atout du logement — est moins immédiatement visible que sur l'annonce A.",
    first_change: "Je mettrais davantage l'ouverture et la vue mer au centre du cadrage.",
  },
};
