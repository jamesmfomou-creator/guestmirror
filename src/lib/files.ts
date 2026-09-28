export interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

// Matches lib/imageOptimize.ts's server-side target exactly: Claude's
// vision encoder downscales beyond ~1568px on the long edge regardless,
// so capping here too loses no signal the model would have used -- it
// just means the upload itself (client -> our server) is smaller and
// faster, and comfortably clear of any request-body-size limit on large
// multi-image submissions.
const MAX_DIMENSION = 1568;
// Below this, a file is assumed already reasonably compressed and skips
// the canvas pass entirely -- kept low (not the previous 1.5MB) because
// real production failures (response_parse_failed, non-JSON platform
// error on the way back from a request that never really reached our own
// code -- see the 2026-09 analysis_failed audit) kept recurring on
// 7-10-image submissions *after* the first compression pass had already
// shipped, meaning real photos compress worse than that first pass
// assumed. Compressing more images, more aggressively, closes that gap.
const RECOMPRESS_THRESHOLD_BYTES = 350_000;
// Iterative fallback for images that are still large after the first pass
// (dense/detailed real photos compress worse than synthetic test images
// did) -- each step targets this many bytes before giving up and sending
// the best attempt so far. Floor of 0.55 is a deliberate, bounded quality
// trade-off: at 1568px this is still clearly legible to a vision model
// doing a holistic read of a listing photo, and a slightly-softer photo
// that successfully uploads beats a guaranteed failure at higher quality.
const TARGET_BYTES_PER_IMAGE = 320_000;
const QUALITY_STEPS = [0.82, 0.7, 0.55];

async function encodeAtQuality(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function resizeImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const needsResize = scale < 1;
    const needsRecompress = file.size > RECOMPRESS_THRESHOLD_BYTES;

    if (!needsResize && !needsRecompress) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let best: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const blob = await encodeAtQuality(canvas, quality);
      if (!blob) continue;
      best = blob;
      if (blob.size <= TARGET_BYTES_PER_IMAGE) break;
    }
    return best ?? file;
  } catch {
    return file;
  }
}

export async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const resized = await resizeImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, base64] = result.split(",");
      const mediaType = meta.match(/data:(.*);base64/)?.[1] || resized.type || file.type;
      resolve({ base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(resized);
  });
}
