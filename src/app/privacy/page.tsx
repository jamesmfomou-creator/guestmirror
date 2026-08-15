import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Confidentialité",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Politique de confidentialité</h1>
      <p className="mt-2 text-sm text-muted-2">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <div className="prose-sm mt-10 space-y-6 text-[15px] leading-relaxed text-foreground">
        <p>
          {BRAND_NAME} (« nous ») propose un outil d&apos;analyse de la présentation d&apos;annonces
          de location courte durée. Cette page décrit, de façon provisoire, comment tes données
          sont traitées le temps du lancement du produit.
        </p>

        <section>
          <h2 className="text-lg font-semibold">Ce que nous collectons</h2>
          <p className="mt-2 text-muted">
            Le lien de ton annonce (si fourni), les captures d&apos;écran que tu importes, les
            informations complémentaires facultatives (ville, type de logement, capacité, prix), et
            ton adresse email si tu crées un compte ou effectues un paiement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Comment nous les utilisons</h2>
          <p className="mt-2 text-muted">
            Tes captures d&apos;écran sont utilisées uniquement pour analyser ton annonce et générer
            ton {BRAND_NAME}. Elles sont stockées de manière privée et ne sont jamais rendues
            publiques ni indexables par les moteurs de recherche.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Paiement</h2>
          <p className="mt-2 text-muted">
            Les paiements sont traités par Stripe. {BRAND_NAME} ne stocke jamais tes informations
            de carte bancaire.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Suppression de tes données</h2>
          <p className="mt-2 text-muted">
            Tu peux supprimer une analyse et les captures associées à tout moment depuis la page de
            résultat correspondante.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2 text-muted">
            Pour toute question relative à tes données, contacte-nous à l&apos;adresse indiquée sur
            le site.
          </p>
        </section>
      </div>
    </div>
  );
}
