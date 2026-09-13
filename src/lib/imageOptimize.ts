import sharp from "sharp";

// Claude's vision encoder downscales any image whose long edge exceeds
// ~1568px before looking at it -- pixels beyond that are discarded
// server-side and contribute nothing to the analysis, only to upload size
// and processing time. Pre-resizing to that same ceiling loses no signal
// the model would have used anyway; it just moves the resize step from
// Anthropic's side (after a full-size upload) to ours (before it).
const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 85;

/**
 * Re-encodes an image for the AI call and for storage: capped to
 * MAX_DIMENSION on the long edge (never upscaled) and JPEG at a quality
 * that keeps listing photos and on-screen text legible. Falls back to the
 * original bytes if decoding fails, so a single malformed upload can't
 * turn into an analysis failure.
 */
export async function optimizeImage(
  base64: string,
  mediaType: string
): Promise<{ base64: string; mediaType: string }> {
  try {
    const input = Buffer.from(base64, "base64");
    const output = await sharp(input)
      .rotate() // apply EXIF orientation before measuring/resizing
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return { base64: output.toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return { base64, mediaType };
  }
}

export async function optimizeImages(
  images: { base64: string; mediaType: string }[]
): Promise<{ base64: string; mediaType: string }[]> {
  return Promise.all(images.map((img) => optimizeImage(img.base64, img.mediaType)));
}
