import { Lock } from "lucide-react";

const LOCKED_ITEMS = [
  "Quelle photo mettre en première",
  "Pourquoi certaines photos affaiblissent ta présentation",
  "L'ordre recommandé de tes premières photos",
  "Les éléments que le voyageur ne comprend pas",
  "3 propositions de titre",
  "Description retravaillée",
  "Les questions que pourrait se poser un voyageur",
  "Les 3 changements prioritaires",
];

export function LockedTeaser({ count }: { count: number }) {
  return (
    <div className="mx-auto mt-6 max-w-xl">
      <h2 className="text-center text-lg font-semibold">
        {count > 0
          ? `J'ai détecté ${count} autres améliorations importantes.`
          : "J'ai détecté d'autres améliorations importantes."}
      </h2>
      <div className="card mt-4 divide-y divide-border overflow-hidden p-0">
        {LOCKED_ITEMS.map((item) => (
          <div key={item} className="flex items-center gap-3 px-5 py-3.5">
            <Lock size={14} className="shrink-0 text-muted-2" />
            <span className="text-sm text-muted">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
