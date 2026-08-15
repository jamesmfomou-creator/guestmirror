import { AnalysisResult } from "@/lib/types";
import { Section } from "./Section";
import { HelpCircle } from "lucide-react";

export function GuestQuestions({ result }: { result: AnalysisResult }) {
  if (result.guest_questions.length === 0) return null;
  return (
    <Section
      title="Les questions que je me poserais"
      subtitle="Ce que je me demanderais encore après avoir vu ton annonce."
    >
      <ul className="space-y-3">
        {result.guest_questions.map((q) => (
          <li key={q} className="card flex items-start gap-3 p-4">
            <HelpCircle size={17} className="mt-0.5 shrink-0 text-accent" />
            <span className="text-sm text-foreground">{q}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
