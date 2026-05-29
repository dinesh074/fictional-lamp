'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { compressImage, formatBytes } from '@/lib/image';
import { photoPublicUrl } from '@/lib/format';
import { Button } from '@/components/ui/button';

export interface ImageUploadProps {
  bucket: string;
  pathPrefix?: string;
  value: string | null | undefined;
  onChange: (path: string | null) => void;
  maxKB?: number;
  label?: string;
  className?: string;
}

/**
 * Compresses an image client-side (<= maxKB) then uploads to the given
 * Supabase storage bucket and returns the stored object path via `onChange`.
 */
export function ImageUpload({
  bucket,
  pathPrefix = '',
  value,
  onChange,
  maxKB = 150,
  label = 'Photo',
  className,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const previewUrl = photoPublicUrl(value, bucket);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setInfo(null);
    try {
      const before = file.size;
      const compressed = await compressImage(file, { maxKB });
      const after = compressed.size;
      const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${pathPrefix ? pathPrefix.replace(/\/$/, '') + '/' : ''}${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
        contentType: compressed.type,
        upsert: false,
      });
      if (error) throw error;
      onChange(path);
      setInfo(`${formatBytes(before)} → ${formatBytes(after)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Upload failed: ${msg}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function clear() {
    if (!value) return;
    if (!/^https?:\/\//i.test(value)) {
      const supabase = createClient();
      await supabase.storage.from(bucket).remove([value]).catch(() => {});
    }
    onChange(null);
    setInfo(null);
  }

  return (
    <div className={className}>
      <div className="text-sm font-medium mb-2">{label}</div>
      <div className="flex items-center gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="size-16 rounded-md object-cover border" />
        ) : (
          <div className="size-16 rounded-md bg-muted border" />
        )}
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Upload className="size-3.5 mr-1" />}
              {value ? 'Replace' : 'Upload'}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={busy}>
                <X className="size-3.5 mr-1" /> Remove
              </Button>
            )}
          </div>
          {info && <div className="text-xs text-muted-foreground">Compressed: {info}</div>}
          {!info && <div className="text-xs text-muted-foreground">Auto-compressed to ≤ {maxKB} KB.</div>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
      </div>
    </div>
  );
}

