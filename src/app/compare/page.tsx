import type { Metadata } from "next";
import { CompareWizard } from "@/components/compare/CompareWizard";

export const metadata: Metadata = {
  title: "Mode comparaison — Laquelle tu cliquerais ?",
  description: "Compare deux annonces et découvre laquelle donne le plus envie de cliquer, et pourquoi.",
};

export default function ComparePage() {
  return <CompareWizard />;
}
