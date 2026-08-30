import { NextRequest, NextResponse } from "next/server";
import { compareRequestSchema, MAX_IMAGE_BYTES } from "@/lib/validation";
import { analyzeListing, AnalysisError } from "@/lib/ai";
import { buildComparison } from "@/lib/compare";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_COMPARE_A, DEMO_COMPARE_B } from "@/lib/demo-data";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Une erreur est survenue. Merci de réessayer." }, { status: 400 });
  }

  const parsed = compareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ajoute au moins une capture pour chacune des deux annonces." },
      { status: 400 }
    );
  }
  const { a, b } = parsed.data;

  for (const img of [...a, ...b]) {
    const approxBytes = (img.base64.length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Une des images dépasse la taille maximale autorisée (8 Mo)." },
        { status: 413 }
      );
    }
  }

  try {
    const emptyInput = {
      listing_url: null,
      city: null,
      property_type: null,
      guest_capacity: null,
      nightly_price: null,
    };

    const [resultA, resultB] = DEMO_MODE
      ? [DEMO_COMPARE_A, DEMO_COMPARE_B]
      : await Promise.all([
          analyzeListing({ images: a, input: emptyInput }),
          analyzeListing({ images: b, input: emptyInput }),
        ]);

    const comparison = buildComparison(resultA, resultB);

    return NextResponse.json({ a: resultA, b: resultB, comparison });
  } catch (err) {
    console.error("[/api/compare] unexpected error:", err);
    if (err instanceof AnalysisError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants." },
      { status: 500 }
    );
  }
}
