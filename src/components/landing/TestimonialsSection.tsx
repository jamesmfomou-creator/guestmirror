import { listPublicTestimonials } from "@/lib/feedback";

const USER_TYPE_LABELS: Record<string, string> = {
  host: "Hôte",
  concierge: "Conciergerie",
  cohost: "Co-hôte",
  other: "Hôte",
};

const PROPERTY_COUNT_LABELS: Record<string, string> = {
  "1": "1 logement",
  "2-5": "2 à 5 logements",
  "6-20": "6 à 20 logements",
  "21+": "21 logements et +",
};

/**
 * Only real, explicitly-consented testimonials (testimonial_permission=true,
 * see PostPurchaseFeedback) -- renders nothing at all until at least one
 * exists, rather than showing placeholder/fake content. No name is shown:
 * the consent collected is for the testimonial text itself, not for
 * deriving and publishing a name from the customer's email.
 */
export async function TestimonialsSection() {
  const testimonials = await listPublicTestimonials();
  if (testimonials.length === 0) return null;

  return (
    <section className="border-t border-border/70 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Témoignages d&apos;hôtes
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.id} className="card p-5 text-left sm:p-6">
              <p className="text-sm leading-relaxed text-foreground">&ldquo;{t.text}&rdquo;</p>
              {(t.userType || t.propertyCountRange) && (
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-2">
                  {[t.userType ? USER_TYPE_LABELS[t.userType] : null, t.propertyCountRange ? PROPERTY_COUNT_LABELS[t.propertyCountRange] : null]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
