import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="mt-3 text-muted">
        Cette page n&apos;existe pas ou cette analyse n&apos;est plus disponible.
      </p>
      <Button href="/" size="lg" className="mt-7">
        Retour à l&apos;accueil
      </Button>
    </div>
  );
}
