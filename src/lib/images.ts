import { randomUUID } from "crypto";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "listing-screenshots";

/**
 * Persists an uploaded screenshot. When Supabase is configured the image is
 * stored privately in the storage bucket and only ever exposed via a
 * signed URL. Otherwise, for local dev / demo mode, the raw data URL is
 * kept in memory so the flow still works end to end without any keys.
 */
export async function storeImage(
  analysisId: string,
  index: number,
  base64: string,
  mediaType: string
): Promise<string> {
  if (!SUPABASE_CONFIGURED) {
    return `data:${mediaType};base64,${base64}`;
  }

  const supabase = getSupabaseAdmin()!;
  const ext = mediaType.split("/")[1] || "jpg";
  const path = `${analysisId}/${index}-${randomUUID()}.${ext}`;
  const buffer = Buffer.from(base64, "base64");

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mediaType,
    upsert: false,
  });
  if (error) throw new Error(`Échec du stockage de l'image : ${error.message}`);
  return path;
}

export async function resolveImageUrl(pathOrUrl: string): Promise<string> {
  if (pathOrUrl.startsWith("data:") || pathOrUrl.startsWith("http") || pathOrUrl.startsWith("/")) {
    return pathOrUrl;
  }
  if (!SUPABASE_CONFIGURED) return pathOrUrl;

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pathOrUrl, 60 * 60);
  if (error || !data) return pathOrUrl;
  return data.signedUrl;
}

export async function resolveImageUrls(paths: string[]): Promise<string[]> {
  return Promise.all(paths.map(resolveImageUrl));
}
