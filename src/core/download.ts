/** Saves `data` as a file through a temporary link. */
export function downloadFile(data: Blob | string, fileName: string, type = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked after the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A file name from the piece's title: no path or reserved characters. */
export function fileNameFor(title: string | undefined, extension: string): string {
  const name = [...(title ?? '')]
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${[...name].slice(0, 80).join('').trim() || 'stave'}.${extension}`;
}

// Browsers refuse a canvas past about 16384 px on a side, and Chrome past
// about 268 million pixels; the area cap leaves room under the second.
const MAX_SIDE = 16384;
const MAX_AREA = 100_000_000;

/** Twice the size for a sharp print, less when the canvas could not hold it. */
export function pngScale(width: number, height: number): number {
  return Math.min(2, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_AREA / (width * height)));
}

/** An SVG drawn on a canvas and saved as a PNG. */
export async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = pngScale(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(image.width * scale));
    canvas.height = Math.max(1, Math.floor(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas available.');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed.'))))
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
