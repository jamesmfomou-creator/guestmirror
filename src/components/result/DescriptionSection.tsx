import { AnalysisResult } from "@/lib/types";
import { BRAND_NAME } from "@/lib/brand";
import { Section } from "./Section";
import { CopyButton } from "@/components/ui/CopyButton";

export function DescriptionSection({ result }: { result: AnalysisResult }) {
  const { description_analysis } = result;
  return (
    <Section title="Ta description">
      <div className="grid gap-4 sm:grid-cols-2">
        {description_analysis.issues.length > 0 && (
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">
              Ce qui peut être amélioré
            </p>
            <ul className="mt-2 space-y-1.5">
              {description_analysis.issues.map((i) => (
                <li key={i} className="text-sm text-muted">
                  • {i}
                </li>
              ))}
            </ul>
          </div>
        )}
        {description_analysis.missing_information.length > 0 && (
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">
              Informations manquantes
            </p>
            <ul className="mt-2 space-y-1.5">
              {description_analysis.missing_information.map((i) => (
                <li key={i} className="text-sm text-muted">
                  • {i}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card mt-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-2">
            Description réécrite par {BRAND_NAME}
          </p>
          <CopyButton text={description_analysis.improved_description} label="Copier la nouvelle description" />
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground">
          {description_analysis.improved_description}
        </p>
      </div>
    </Section>
  );
}
