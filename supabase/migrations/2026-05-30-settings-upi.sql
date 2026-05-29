-- =====================================================================
-- Migration: UPI VPA on settings (for wa.me reminders & invoices)
-- =====================================================================
alter table public.settings
  add column if not exists upi_vpa text;
alter table public.settings
  add column if not exists upi_payee_name text;

