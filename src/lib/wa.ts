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
  const upi = ctx.upiLink
    ? `\nPay via UPI: ${ctx.upiLink}`
    : ctx.settings?.upi_vpa
      ? `\nUPI: ${ctx.settings.upi_vpa}`
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

