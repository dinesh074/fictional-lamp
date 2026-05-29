import type { Tenant, Settings } from './types';

/** Tenant override -> settings default -> 5. Clamped to 1..28. */
export function effectiveDueDay(tenant: Pick<Tenant, 'payment_due_day'> | null | undefined, settings: Pick<Settings, 'payment_due_day'> | null | undefined) {
  const d = tenant?.payment_due_day ?? settings?.payment_due_day ?? 5;
  return Math.max(1, Math.min(28, d));
}

/** Day-of-month for a date string (YYYY-MM-DD). */
export function dayOfMonth(d: string | Date | null | undefined) {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return null;
  return dt.getDate();
}

/** Build a due date for `period` (1st of month) using `dueDay`, clamped to 28. */
export function computeDueDate(period: string | Date, dueDay: number) {
  const dt = typeof period === 'string' ? new Date(period) : period;
  const d = Math.max(1, Math.min(28, dueDay));
  return new Date(dt.getFullYear(), dt.getMonth(), d);
}

export function tenantOnHold(t: Pick<Tenant, 'payment_hold' | 'payment_hold_until'> | null | undefined, today = new Date()) {
  if (!t?.payment_hold) return false;
  if (!t.payment_hold_until) return true;
  const until = new Date(t.payment_hold_until);
  return until >= new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

