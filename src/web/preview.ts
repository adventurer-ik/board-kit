/**
 * 그림 미리보기 만들기 — 브라우저에서 줄인다(서버는 그림 디코더가 없다).
 * 긴 변 1600px 넘거나 1MB 넘는 png · jpeg · webp 만. gif(움직임) · svg 는 안 만든다.
 * 줄인 것이 원본보다 작지 않으면 null — 괜히 두 장을 두지 않는다.
 */
const LONG_EDGE = 1600;
const MIN_BYTES = 1_000_000;
const SOURCES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function makePreview(file: File): Promise<Blob | null> {
  if (!SOURCES.has(file.type) || typeof createImageBitmap !== 'function') return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file); // EXIF 회전은 브라우저가 적용한다(imageOrientation 기본 from-image)
  } catch {
    return null;
  }
  try {
    const long = Math.max(bmp.width, bmp.height);
    if (long <= LONG_EDGE && file.size <= MIN_BYTES) return null;
    const scale = Math.min(1, LONG_EDGE / long);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82));
    return blob && blob.size < file.size ? blob : null;
  } finally {
    bmp.close();
  }
}
