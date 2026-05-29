import Papa from 'papaparse';

export function formatINR(amount: number | string | null | undefined) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatMonth(date: string | Date | null | undefined) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
}

export function downloadCSV<T extends object>(rows: T[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Build a wa.me URL with pre-filled message. Phone should include country code
// but we'll strip everything except digits and assume IN (91) if 10 digits.
export function waLink(phone: string | null | undefined, message: string) {
  if (!phone) return '#';
  const digits = phone.replace(/\D/g, '');
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export function monthStart(d: Date = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Resolve a stored photo URL. If already a full URL, return as-is; otherwise
 * treat it as an object path inside a public Supabase storage bucket.
 */
export function photoPublicUrl(value: string | null | undefined, bucket = 'tenant-photos'): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return value;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${value.replace(/^\/+/, '')}`;
}

