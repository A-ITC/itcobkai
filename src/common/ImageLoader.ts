const IMAGE_URL = "/dist/image";

function createFallbackImage(width = 64, height = 64): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const scale = width / 256;
  const cx = width / 2;
  ctx.fillStyle = "#dcdcdc";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#646464";
  ctx.beginPath();
  ctx.arc(cx, 90 * scale, 45 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, 210 * scale, 70 * scale, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toDataURL();
}

function getImageUrl(category: string, hash: string): string {
  return hash ? `${IMAGE_URL}/${category}/${hash}` : "";
}

export function loadImage(category: string, hash: string, img: HTMLImageElement) {
  const src = getImageUrl(category, hash);
  return new Promise<HTMLImageElement>(resolve => {
    if (!hash) {
      img.src = createFallbackImage();
      img.onload = () => resolve(img);
      return;
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`[loadImage] Failed to load: ${src} - using fallback image`);
      img.src = createFallbackImage();
      img.onload = () => resolve(img);
    };
    img.src = src;
  });
}
