import imageCompression from 'browser-image-compression';

export interface CompressOptions {
  /** Target maximum size in kilobytes. Default 150 KB. */
  maxKB?: number;
  /** Max width/height in pixels. Default 1280. */
  maxWidthOrHeight?: number;
}

/**
 * Compress an image File down to roughly `maxKB` kilobytes.
 * Returns a File with the same name and a sensible mime type.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxKB = opts.maxKB ?? 150;
  const out = await imageCompression(file, {
    maxSizeMB: maxKB / 1024,
    maxWidthOrHeight: opts.maxWidthOrHeight ?? 1280,
    useWebWorker: true,
    initialQuality: 0.8,
    fileType: file.type.startsWith('image/') && file.type !== 'image/heic' ? file.type : 'image/jpeg',
  });
  return new File([out], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
    type: out.type || 'image/jpeg',
    lastModified: Date.now(),
  });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

