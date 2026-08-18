export interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

const MAX_DIMENSION = 1920;
const RECOMPRESS_THRESHOLD_BYTES = 1_500_000;
const JPEG_QUALITY = 0.85;

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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    return blob ?? file;
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
