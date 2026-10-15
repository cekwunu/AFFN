/**
 * Client-side image compression before upload (CAT-01): photos from a phone are often 4–12 MB;
 * the menu needs ~1200 px. Keeps public pages fast (NFR-01) and uploads short on 4G.
 */

/** Target size that fits within max × max, never enlarging. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Resizes and re-encodes an image in the browser (WebP, JPEG where WebP encoding is missing).
 * Returns the original file when it cannot be decoded, so the upload limits still apply.
 */
export async function compressImage(
  file: File,
  { max = 1200, quality = 0.82 }: { max?: number; quality?: number } = {},
): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const size = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
  if (!blob || blob.size >= file.size) return file;
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const base = file.name.replace(/\.[^.]+$/, '') || 'bilde';
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}
