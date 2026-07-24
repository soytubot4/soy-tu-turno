'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { signUploadUrl } from '@/features/productos/api';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/* eslint-disable @next/next/no-img-element */

/** Sube una imagen de producto al bucket tenant-assets (vía signed URL) y devuelve su URL. */
export function ProductImageUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Elegí una imagen');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5 MB');
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const signed = await signUploadUrl(ext);
      const { error } = await getSupabaseBrowserClient()
        .storage.from('tenant-assets')
        .uploadToSignedUrl(signed.path, signed.token, file);
      if (error) throw new Error(error.message);
      onChange(signed.publicUrl);
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      {value ? (
        <div className="relative">
          <img src={value} alt="" className="h-12 w-12 rounded-[var(--radius)] object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--color-destructive)] p-0.5 text-white"
            title="Quitar foto"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-12 w-12 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)]"
          title="Subir foto"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
