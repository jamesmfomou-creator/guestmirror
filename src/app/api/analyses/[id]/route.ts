import { NextRequest, NextResponse } from "next/server";
import { deleteAnalysis, getAnalysis, updateAnalysisInput } from "@/lib/store";
import { updateAnalysisInputSchema } from "@/lib/validation";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = await getAnalysis(id);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
  }
  await deleteAnalysis(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = await getAnalysis(id);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
  }

  const parsed = updateAnalysisInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Les informations envoyées ne sont pas valides." }, { status: 400 });
  }

  await updateAnalysisInput(id, parsed.data);
  return NextResponse.json({ ok: true });
}
