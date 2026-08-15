# GuestMirror

**Ton Airbnb donne-t-il vraiment envie de réserver ?**

GuestMirror analyse la présentation d'une annonce de location courte durée (photos, titre,
description) et génère un **GuestMirror /100** : sous-scores, points forts/faibles, priorités,
nouveaux titres, description réécrite, ordre de photos recommandé et plan d'action.

GuestMirror est un outil indépendant. Il n'est ni affilié, ni sponsorisé, ni approuvé par Airbnb, et
ne prédit ni ne garantit de résultat sur les réservations.

## Parcours produit (funnel TikTok/Instagram)

```
Landing (/) → import (lien, ou capture importée directement depuis le hero)
  → persona facultatif (ville, type de logement, capacité, prix)
  → email ("Où veux-tu recevoir ton résultat ?")
  → analyse animée
  → AHA MOMENT (/result/[id], gratuit) : score + verdict + "Ce que j'ai compris en 5 secondes"
    + "Ma première hésitation" + UN problème principal + liste verrouillée (8 items)
  → hard paywall ("Ton annonce peut faire mieux.", 9,90€, paiement unique)
  → rapport complet (débloqué)
  → re-scan ("J'ai modifié mon annonce") → avant/après (preuve produit, score + verdict + points
    clés qui ont bougé)
  → cartes partageables (PNG téléchargeables) à chaque étape clé

/compare (accessible sans email ni paiement, entrée virale) → "Laquelle tu cliquerais ?"
  → import de 2 annonces → verdict A vs B + pourquoi la gagnante gagne + carte partageable
```

Aucun mot de passe, aucun compte formel requis avant de voir le résultat gratuit : l'email
collecté juste avant l'analyse est simplement rattaché à l'analyse (pas de friction de
création de compte). Le mode comparaison reste, volontairement, sans email ni paywall — c'est
l'outil d'acquisition virale, pas le produit payant.

### Fonctionnalités clés

- **Test des 5 secondes** (gratuit) : score, verdict (🔥 JE CLIQUE / 👀 ÇA M'INTÉRESSE /
  🤔 J'HÉSITE / 😬 JE PASSE), "Ce que j'ai compris en 5 secondes", "Ma première hésitation", et UN
  seul problème principal. Le reste (8 axes) est listé mais verrouillé — c'est le hard paywall.
- **Rapport complet** (débloqué) : GuestMirror détaillé (photo de couverture, photos, titre,
  description, clarté de l'offre, attractivité, confiance voyageur), impact de la photo de
  couverture, questions que se poserait encore un voyageur, titres/description réécrits, ordre de
  photos recommandé, plan d'action.
- **Avant/après** (post-paiement, après re-scan) : score + verdict avant/après, delta en points,
  comparatif des 3 sous-scores "5 secondes" les plus parlants (Impact visuel, Différenciation,
  Clarté), et jusqu'à 3 points sur "Ce qui a changé" — la preuve produit, pensée pour être filmée.
- **Mode comparaison** (`/compare`) : compare deux annonces (juste des captures, sans email ni
  paiement), affiche le verdict, pourquoi la gagnante l'emporte (raisons numérotées), le problème
  n°1 de la perdante, et le premier changement à faire.
- **Cartes partageables** : Test des 5 secondes, GuestMirror complet, avant/après, et comparaison —
  toutes téléchargeables en PNG haute résolution, sans information privée du logement.

Tout le produit parle comme un voyageur qui réagit à chaud, jamais comme un consultant SEO/revenue
management — voir `src/lib/ai.ts` pour le prompt et les garde-fous imposés au modèle (aucune
mention de ranking Airbnb, pricing dynamique, benchmark marché, etc.).

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · Supabase (DB + Storage) ·
Stripe Checkout · Anthropic Claude (analyse multimodale) · Zod · déployé sur Vercel.

## Démarrage rapide (mode démo — zéro clé API)

```bash
npm install
cp .env.example .env.local   # DEMO_MODE=true par défaut
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000). Tout le parcours est testable
immédiatement : import de captures, analyse animée, GuestMirror, paywall (le déblocage est simulé
tant que Stripe n'est pas configuré), rapport complet, re-scan avec comparatif avant/après, et
téléchargement de la carte GuestMirror.

En mode démo, aucune clé (Anthropic, Supabase, Stripe) n'est nécessaire :
- l'analyse renvoie toujours le même jeu de données réaliste (`src/lib/demo-data.ts`) ;
- le paiement est simulé (l'analyse est débloquée directement, sans passer par Stripe) ;
- les analyses sont stockées dans un fichier temporaire (`os.tmpdir()`), donc réinitialisées à
  chaque redémarrage machine — largement suffisant pour tester ou filmer une démo.

## Activer les vrais services

Passe `DEMO_MODE=false` dans `.env.local` (ou renseigne simplement `ANTHROPIC_API_KEY`, qui
désactive automatiquement le mode démo) puis configure au fur et à mesure :

### 1. IA (Anthropic Claude)

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

Le prompt et le schéma JSON strict sont dans `src/lib/ai.ts`. L'analyse est forcée via un
tool-call structuré (`submit_guestmirror_analysis`) pour garantir une réponse JSON valide.

### 2. Supabase (base de données + stockage des captures)

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Exécute les migrations `supabase/migrations/0001_init.sql` puis `0002_add_email.sql` (SQL
   editor ou `supabase db push`). Elles créent les tables `profiles`, `analyses`
   (avec la colonne `email` du funnel), `analysis_images`, `payments`, activent la RLS
   (verrouillée : tout accès passe par la clé service-role côté serveur) et créent le bucket de
   stockage privé `listing-screenshots`.
3. Renseigne :
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```
   Dès que les trois sont présentes, l'app bascule automatiquement du stockage fichier local vers
   Supabase (`src/lib/env.ts` → `SUPABASE_CONFIGURED`).

### 3. Stripe (paiement unique 9,90€)

1. Crée un produit avec un prix unique de 9,90€ dans le dashboard Stripe.
2. Renseigne :
   ```
   STRIPE_SECRET_KEY=
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
3. En local, écoute les webhooks avec `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. En production, ajoute un endpoint webhook Stripe pointant vers
   `https://<ton-domaine>/api/stripe/webhook` pour l'événement `checkout.session.completed`.

Tant que `STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID` ne sont pas renseignés, le bouton de paiement
simule directement le déblocage (utile pour démontrer le produit sans compte Stripe).

## Déploiement Vercel

1. Pousse le repo sur GitHub puis importe-le dans Vercel.
2. Renseigne toutes les variables de `.env.example` dans les Environment Variables du projet.
3. `NEXT_PUBLIC_SITE_URL` doit pointer vers le domaine de production (utilisé pour les URLs
   Stripe de succès/annulation et les métadonnées OpenGraph/sitemap).
4. Déploie. Les routes API (`src/app/api/**`) tournent en runtime Node par défaut — nécessaire
   pour le SDK Stripe et Anthropic.

## Structure du projet

```
src/
  app/                    routes (App Router)
    page.tsx              landing
    analyze/               wizard d'import (lien / captures / questions)
    compare/                mode comparaison (deux annonces, sans paiement)
    result/[id]/            Test des 5 secondes + rapport complet + paywall
    pricing|privacy|terms/  pages publiques
    api/
      analyze/              lance l'analyse IA (ou démo) et crée l'enregistrement
      compare/               lance deux analyses et synthétise le verdict A/B
      checkout/              crée une session Stripe Checkout (ou simule le déblocage)
      stripe/webhook/        déverrouille l'analyse après paiement confirmé
      analyses/[id]/         suppression d'une analyse
  components/
    landing/ analyze/ compare/ result/ ui/ layout/
  lib/
    ai.ts                  prompt (ton voyageur, en français) + schéma JSON strict + appel Claude
    compare.ts               synthèse déterministe du verdict A/B (pas d'appel IA supplémentaire)
    store.ts                abstraction de persistance (Supabase ou fichier local en démo)
    images.ts                upload/résolution des captures (Storage privé ou data URL)
    stripe.ts supabase/      clients tiers
    types.ts validation.ts  types partagés + schémas Zod
    demo-data.ts             jeu de données démo
supabase/migrations/        schéma SQL + policies RLS + bucket de stockage
```

## Checklist avant mise en production

- [ ] `DEMO_MODE=false` (ou clé Anthropic renseignée) en production
- [ ] Supabase configuré (DB + Storage) — sans ça, les analyses ne survivent pas à un redéploiement
- [ ] Stripe en mode live (clé secrète live, prix live, webhook live)
- [ ] `NEXT_PUBLIC_SITE_URL` réglé sur le domaine réel
- [ ] Politique de confidentialité et conditions relues par un juriste (contenu actuel = base de
      départ provisoire)
- [ ] Adresse de contact réelle ajoutée sur `/privacy` et `/terms`
- [ ] Analytics branché (PostHog ou Plausible — voir `src/lib/analytics.ts`, déjà tous les
      événements du parcours sont émis, il suffit de brancher le script du fournisseur dans
      `layout.tsx`)
- [ ] Test du parcours complet en conditions réelles : paiement Stripe réel (mode test d'abord),
      upload de vraies captures, webhook reçu

## Ce qui reste simulé / à finaliser

- **Auth** : aucun compte n'est requis pour analyser/payer (friction minimale voulue). Le schéma
  DB prévoit `user_id` nullable et une table `profiles` pour brancher Supabase Auth (magic link)
  plus tard, mais l'UI de connexion n'est pas construite dans ce MVP.
- **Scraping d'URL Airbnb** : le champ lien est collecté et transmis à l'IA comme contexte texte,
  mais aucun scraping des pages Airbnb n'est effectué (conformément à la consigne de ne pas
  contourner leurs protections). L'analyse réelle repose sur les captures d'écran importées.
- **Stockage local en mode démo** : fonctionne pour tester/démontrer le produit, mais n'est pas
  une persistance de production (voir section Supabase ci-dessus).
- **Analytics** : les événements sont émis mais aucun fournisseur n'est branché par défaut
  (`window.posthog` / `window.plausible` sont appelés s'ils existent, sans faire échouer l'app
  sinon).
