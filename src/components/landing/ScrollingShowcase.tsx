import { ShowcaseItem } from "@/lib/showcase";
import { scoreColor, verdictFor } from "@/lib/utils";

const USER_TYPE_LABELS: Record<string, string> = {
  host: "Hôte",
  concierge: "Conciergerie",
  cohost: "Co-hôte",
  other: "Hôte",
};

// Below this, a 2x-duplicated loop reads as obviously repetitive rather
// than as a real, ongoing stream of activity -- render nothing instead
// (same "don't show thin social proof" call as SocialProof's own
// threshold) rather than padding with anything not real.
const MIN_ITEMS = 6;

function ScoreCard({ score }: { score: number }) {
  const verdict = verdictFor(score);
  return (
    <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-sm">
      <span className="text-base leading-none">{verdict.emoji}</span>
      <span className="font-semibold tabular-nums" style={{ color: scoreColor(score) }}>
        {score}/100
      </span>
      <span className="text-muted-2">Annonce analysée</span>
    </div>
  );
}

function TestimonialCard({ item }: { item: Extract<ShowcaseItem, { type: "testimonial" }> }) {
  const label = item.userType ? USER_TYPE_LABELS[item.userType] : null;
  return (
    <div className="flex max-w-xs shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-sm">
      <span className="truncate text-foreground">&ldquo;{item.text}&rdquo;</span>
      {label && <span className="shrink-0 text-muted-2">— {label}</span>}
    </div>
  );
}

export function ScrollingShowcase({ items, className }: { items: ShowcaseItem[]; className?: string }) {
  if (items.length < MIN_ITEMS) return null;

  const renderItem = (item: ShowcaseItem, key: string) =>
    item.type === "score" ? <ScoreCard key={key} score={item.score} /> : <TestimonialCard key={key} item={item} />;

  return (
    <div className={`no-scrollbar overflow-hidden ${className ?? ""}`}>
      <div className="animate-marquee flex w-max gap-3">
        {items.map((item, i) => renderItem(item, `a-${i}`))}
        {items.map((item, i) => renderItem(item, `b-${i}`))}
      </div>
    </div>
  );
}
