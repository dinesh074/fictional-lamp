import type { Settings, Tenant, Payment } from './types';
import { formatINR, formatDate, formatMonth, photoPublicUrl } from './format';

/** Normalize an Indian phone number to E.164-ish digits (no +). 10-digit -> 91 prefix. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/** Build a wa.me click-to-chat URL. */
export function waMeUrl(phone: string | null | undefined, message: string) {
  const intl = normalizePhone(phone);
  if (!intl) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

/**
 * Open WhatsApp with the message and, when possible, the QR image attached.
 *
 * - **Mobile / supported browsers** → uses the Web Share API
 *   (`navigator.share({files, text})`). The system share sheet pops up with
 *   WhatsApp as one of the targets; picking it pre-fills both the message
 *   and the QR image as an attachment.
 * - **Desktop / unsupported browsers** → falls back to `wa.me/?text=…`.
 *   The image URL is already included in the text body so the recipient can
 *   still tap to view the QR.
 *
 * Returns `true` if WhatsApp was opened (any way), `false` if there was no
 * phone number to send to.
 */
export async function openWhatsAppWithMaybeImage(opts: {
  phone: string | null | undefined;
  message: string;
  imageUrl?: string | null;
  imageFilename?: string;
}): Promise<boolean> {
  const intl = normalizePhone(opts.phone);
  if (!intl) return false;

  // 1. Try native file-share first (mobile WhatsApp picks this up cleanly).
  if (typeof navigator !== 'undefined' && opts.imageUrl && 'share' in navigator) {
    try {
      const res = await fetch(opts.imageUrl, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        const name = opts.imageFilename ?? 'upi-qr.png';
        const file = new File([blob], name, { type: blob.type || 'image/png' });
        const data: ShareData & { files?: File[] } = {
          text: opts.message,
          files: [file],
        };
        const canShareFiles =
          typeof (navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare === 'function'
            ? (navigator as Navigator & { canShare: (d: ShareData) => boolean }).canShare(data)
            : true;
        if (canShareFiles) {
          await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(data);
          return true;
        }
      }
    } catch {
      // Either user cancelled or browser blocked – fall through to wa.me.
    }
  }

  // 2. Plain wa.me fallback (desktop, or share API unavailable).
  const url = `https://wa.me/${intl}?text=${encodeURIComponent(opts.message)}`;
  window.open(url, '_blank', 'noopener');
  return true;
}

export type ReminderTemplate =
  | 'payment_due'
  | 'payment_overdue'
  | 'payment_received'
  | 'store_purchase'
  | 'generic';

export interface ReminderContext {
  tenant: Pick<Tenant, 'name'>;
  settings: Pick<Settings, 'hostel_name' | 'hostel_phone' | 'upi_vpa' | 'upi_qr_url'> | null;
  payment?: Pick<Payment, 'amount' | 'period_month' | 'due_date' | 'status'>;
  amount?: number;
  upiLink?: string | null;
  extra?: string;
}

/** Render the default message for a template. Users can override before sending. */
export function renderTemplate(tpl: ReminderTemplate, ctx: ReminderContext): string {
  const hostel = ctx.settings?.hostel_name ?? 'Your PG';
  const contact = ctx.settings?.hostel_phone ? ` Contact: ${ctx.settings.hostel_phone}.` : '';
  // Plain-text UPI ID only. A pre-filled-amount deep link is capped at
  // ₹2k/day to new payees by NPCI, and a blank-amount link just adds noise —
  // tenants paste / type the VPA into their UPI app directly. If the owner
  // uploaded a QR image in Settings, append its public URL so the tenant can
  // long-press in WhatsApp to scan it.
  const qrUrl = photoPublicUrl(ctx.settings?.upi_qr_url, 'upi-qr');
  const upi = ctx.settings?.upi_vpa
    ? `\nUPI ID: ${ctx.settings.upi_vpa}${hostel ? ` (${hostel})` : ''}${qrUrl ? `\nScan QR: ${qrUrl}` : ''}`
    : qrUrl
      ? `\nScan QR: ${qrUrl}`
      : '';
  const name = ctx.tenant.name;

  switch (tpl) {
    case 'payment_due':
      return `Hi ${name}, gentle reminder: your rent of ${formatINR(ctx.payment?.amount ?? ctx.amount ?? 0)} for ${formatMonth(ctx.payment?.period_month ?? new Date())} is due on ${formatDate(ctx.payment?.due_date ?? new Date())}.${upi}\n— ${hostel}.${contact}`;
    case 'payment_overdue':
      return `Hi ${name}, your rent of ${formatINR(ctx.payment?.amount ?? ctx.amount ?? 0)} for ${formatMonth(ctx.payment?.period_month ?? new Date())} is overdue (was due ${formatDate(ctx.payment?.due_date ?? new Date())}). Please clear at the earliest.${upi}\n— ${hostel}.${contact}`;
    case 'payment_received':
      return `Hi ${name}, we have received your payment of ${formatINR(ctx.payment?.amount ?? ctx.amount ?? 0)} for ${formatMonth(ctx.payment?.period_month ?? new Date())}. Thank you!\n— ${hostel}.`;
    case 'store_purchase':
      return `Hi ${name}, your store purchase of ${formatINR(ctx.amount ?? 0)} has been added to your ledger.${upi}\n— ${hostel}.`;
    case 'generic':
    default:
      return ctx.extra ?? `Hi ${name}, a message from ${hostel}.${contact}`;
  }
}

// =====================================================================
// Custom (user-editable) templates — placeholder substitution
// =====================================================================

/**
 * Substitutes {{key}} placeholders in a template body.
 * Unknown placeholders are left as-is so the sender can fill them.
 */
export function renderCustomTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    if (v === null || v === undefined || v === '') return `{{${key}}}`;
    return String(v);
  });
}

/** Common variables for a tenant-targeted message. */
export interface TenantWaVars {
  tenant_name: string;
  hostel_name: string;
  hostel_phone: string;
  contact_line: string;     // " Contact: +91…" or ""
  upi_line: string;         // "\nUPI ID: …\nScan QR: …" or ""
  upi_vpa: string;
  upi_qr_url: string;       // full public URL or ""
  room: string;
  building: string;
  amount: string;
  period_month: string;
  due_date: string;
  available_beds: string;
  building_summary: string;
  // free-form, user fills in dialog
  event_name: string;
  event_date: string;
  occasion: string;
  offer_details: string;
  valid_till: string;
}

export function buildTenantVars(opts: {
  tenant: Pick<Tenant, 'name' | 'room'>;
  settings: Pick<Settings, 'hostel_name' | 'hostel_phone' | 'upi_vpa' | 'upi_qr_url'> | null;
  payment?: Pick<Payment, 'amount' | 'period_month' | 'due_date'> | null;
  upiLink?: string | null;
  availableBeds?: number;
  buildingSummary?: string;
}): Partial<TenantWaVars> {
  const hostel = opts.settings?.hostel_name ?? 'Your PG';
  const phone = opts.settings?.hostel_phone ?? '';
  // See renderTemplate(): plain UPI ID + optional QR image URL.
  const qrUrl = photoPublicUrl(opts.settings?.upi_qr_url, 'upi-qr');
  const upi = opts.settings?.upi_vpa
    ? `\nUPI ID: ${opts.settings.upi_vpa}${hostel ? ` (${hostel})` : ''}${qrUrl ? `\nScan QR: ${qrUrl}` : ''}`
    : qrUrl
      ? `\nScan QR: ${qrUrl}`
      : '';
  return {
    tenant_name: opts.tenant.name,
    hostel_name: hostel,
    hostel_phone: phone,
    contact_line: phone ? ` Contact: ${phone}.` : '',
    upi_line: upi,
    upi_vpa: opts.settings?.upi_vpa ?? '',
    upi_qr_url: qrUrl ?? '',
    room: opts.tenant.room?.room_number ?? '',
    building: opts.tenant.room?.building?.name ?? '',
    amount: opts.payment ? formatINR(opts.payment.amount) : '',
    period_month: opts.payment ? formatMonth(opts.payment.period_month) : '',
    due_date: opts.payment ? formatDate(opts.payment.due_date) : '',
    available_beds: opts.availableBeds !== undefined ? String(opts.availableBeds) : '',
    building_summary: opts.buildingSummary ?? '',
  };
}
