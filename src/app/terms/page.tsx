import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Conditions d&apos;utilisation</h1>
      <p className="mt-2 text-sm text-muted-2">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-foreground">
        <section>
          <h2 className="text-lg font-semibold">Nature du service</h2>
          <p className="mt-2 text-muted">
            {BRAND_NAME} est un outil indépendant d&apos;analyse de la présentation d&apos;annonces
            de location courte durée. {BRAND_NAME} n&apos;est ni affilié, ni sponsorisé, ni
            approuvé par Airbnb ou toute autre plateforme de location.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Aucune garantie de résultat</h2>
          <p className="mt-2 text-muted">
            Le {BRAND_NAME} et l&apos;ensemble des recommandations fournies sont des estimations
            produites par notre outil à partir des éléments visibles de l&apos;annonce. Ils ne
            prédisent ni ne garantissent une augmentation des réservations, un meilleur classement
            dans les résultats de recherche, ou tout autre résultat commercial.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Paiement</h2>
          <p className="mt-2 text-muted">
            L&apos;analyse complète est proposée au tarif de 9,90€, en paiement unique, sans
            abonnement ni renouvellement automatique.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Responsabilité de l&apos;utilisateur</h2>
          <p className="mt-2 text-muted">
            Tu es responsable des captures d&apos;écran et informations que tu importes, ainsi que
            du respect des conditions d&apos;utilisation des plateformes tierces mentionnées dans
            ton annonce.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2 text-muted">
            Pour toute question relative à ces conditions, contacte-nous à l&apos;adresse indiquée
            sur le site.
          </p>
        </section>
      </div>
    </div>
  );
}
