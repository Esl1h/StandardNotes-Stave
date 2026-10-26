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
