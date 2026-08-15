import { AnalysisResult } from "@/lib/types";

export function FirstHesitation({ result }: { result: AnalysisResult }) {
  if (!result.first_hesitation) return null;
  return (
    <div className="mx-auto mt-10 max-w-xl text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-2">
        Ma première hésitation
      </p>
      <p className="mx-auto mt-3 max-w-md text-lg text-foreground">
        &ldquo;{result.first_hesitation}&rdquo;
      </p>
    </div>
  );
}
