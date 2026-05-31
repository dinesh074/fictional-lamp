import type { Settings, Tenant, Payment } from './types';
import { formatINR, formatDate, formatMonth } from './format';

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

export type ReminderTemplate =
  | 'payment_due'
  | 'payment_overdue'
  | 'payment_received'
  | 'store_purchase'
  | 'generic';

export interface ReminderContext {
  tenant: Pick<Tenant, 'name'>;
  settings: Pick<Settings, 'hostel_name' | 'hostel_phone' | 'upi_vpa'> | null;
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
  // tenants paste / type the VPA into their UPI app directly.
  const upi = ctx.settings?.upi_vpa
    ? `\nUPI ID: ${ctx.settings.upi_vpa}${hostel ? ` (${hostel})` : ''}`
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
  upi_line: string;         // "\nPay via UPI: …" or ""
  upi_vpa: string;
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
  settings: Pick<Settings, 'hostel_name' | 'hostel_phone' | 'upi_vpa'> | null;
  payment?: Pick<Payment, 'amount' | 'period_month' | 'due_date'> | null;
  upiLink?: string | null;
  availableBeds?: number;
  buildingSummary?: string;
}): Partial<TenantWaVars> {
  const hostel = opts.settings?.hostel_name ?? 'Your PG';
  const phone = opts.settings?.hostel_phone ?? '';
  // See renderTemplate(): plain UPI ID only, no deep link.
  const upi = opts.settings?.upi_vpa
    ? `\nUPI ID: ${opts.settings.upi_vpa}${hostel ? ` (${hostel})` : ''}`
    : '';
  return {
    tenant_name: opts.tenant.name,
    hostel_name: hostel,
    hostel_phone: phone,
    contact_line: phone ? ` Contact: ${phone}.` : '',
    upi_line: upi,
    upi_vpa: opts.settings?.upi_vpa ?? '',
    room: opts.tenant.room?.room_number ?? '',
    building: opts.tenant.room?.building?.name ?? '',
    amount: opts.payment ? formatINR(opts.payment.amount) : '',
    period_month: opts.payment ? formatMonth(opts.payment.period_month) : '',
    due_date: opts.payment ? formatDate(opts.payment.due_date) : '',
    available_beds: opts.availableBeds !== undefined ? String(opts.availableBeds) : '',
    building_summary: opts.buildingSummary ?? '',
  };
}
