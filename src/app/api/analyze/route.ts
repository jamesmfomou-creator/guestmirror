import { NextRequest, NextResponse } from "next/server";
import { analyzeRequestSchema, MAX_IMAGE_BYTES } from "@/lib/validation";
import { analyzeListing, AnalysisError } from "@/lib/ai";
import { createAnalysis, getAnalysis } from "@/lib/store";
import { storeImage } from "@/lib/images";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_IMAGES, DEMO_RESULT, DEMO_RESULT_AFTER } from "@/lib/demo-data";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Une erreur est survenue. Merci de réessayer." },
      { status: 400 }
    );
  }

  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Les informations envoyées ne sont pas valides. Merci de réessayer." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  for (const img of data.images) {
    const approxBytes = (img.base64.length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Une des images dépasse la taille maximale autorisée (8 Mo)." },
        { status: 413 }
      );
    }
  }

  const input = {
    listing_url: data.listing_url || null,
    city: data.city || null,
    property_type: data.property_type || null,
    guest_capacity: data.guest_capacity || null,
    nightly_price: data.nightly_price || null,
  };

  try {
    let previousAnalysis = null;
    if (data.previous_analysis_id) {
      previousAnalysis = await getAnalysis(data.previous_analysis_id);
    }

    if (DEMO_MODE) {
      const result = previousAnalysis ? DEMO_RESULT_AFTER : DEMO_RESULT;
      const record = await createAnalysis({
        input,
        email: data.email,
        images: DEMO_IMAGES,
        result,
        previousAnalysisId: data.previous_analysis_id || null,
      });
      return NextResponse.json({ id: record.id });
    }

    const result = await analyzeListing({ images: data.images, input });

    const tempId = crypto.randomUUID();
    const storedImages = await Promise.all(
      data.images.map((img, i) => storeImage(tempId, i, img.base64, img.mediaType))
    );

    const record = await createAnalysis({
      input,
      email: data.email,
      images: storedImages,
      result,
      previousAnalysisId: data.previous_analysis_id || null,
    });

    return NextResponse.json({ id: record.id });
  } catch (err) {
    if (err instanceof AnalysisError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants." },
      { status: 500 }
    );
  }
}
