-- =====================================================================
-- Migration: tenant due-day always = check-in day-of-month (no cap)
-- The earlier backfill clamped at 28 which forced a 30-Nov check-in to
-- be billed on the 28th. Per business rule, the due day must equal the
-- check-in day every month — and gracefully clamp to month-end only at
-- render time (e.g. Feb 30 → Feb 28/29).
-- Re-runnable.
-- =====================================================================

-- 0. Widen the CHECK constraint from 1..28 to 1..31. The 28 cap was a
--    leftover from an early "always-valid-in-February" simplification.
alter table public.tenants
  drop constraint if exists tenants_payment_due_day_check;
alter table public.tenants
  add constraint tenants_payment_due_day_check
  check (payment_due_day is null or (payment_due_day between 1 and 31));

-- 1. Re-backfill EVERY tenant with a check-in date. We deliberately ignore
--    the legacy `auto_due_day` flag here because the previous migration
--    left many tenants with stale / wrong values (e.g. defaulted to the
--    settings.payment_due_day = 5 instead of their check-in day). Anyone
--    who genuinely wants a custom due-day can edit it AFTER this runs.
update public.tenants
   set payment_due_day = extract(day from check_in_date)::int,
       auto_due_day    = true
 where check_in_date is not null
   and (
        payment_due_day is null
     or payment_due_day <> extract(day from check_in_date)::int
   );

-- 2. Trigger: on INSERT / UPDATE, if auto_due_day = true and check_in_date
--    is set, keep payment_due_day in lockstep with the check-in day so
--    new tenants and edits both get the right value without app code
--    needing to remember.
create or replace function public.sync_tenant_due_day()
returns trigger
language plpgsql
as $$
begin
  if new.auto_due_day and new.check_in_date is not null then
    new.payment_due_day := extract(day from new.check_in_date)::int;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tenant_sync_due_day on public.tenants;
create trigger trg_tenant_sync_due_day
  before insert or update of check_in_date, auto_due_day on public.tenants
  for each row execute function public.sync_tenant_due_day();

-- 3. Rewrite existing UNPAID payments.due_date to match the tenant's
--    (now-correct) payment_due_day, clamped to the last day of the period
--    month — e.g. period 2026-06, due-day 31 → 2026-06-30. Paid rows are
--    intentionally left alone so historical receipts stay accurate.
update public.payments p
   set due_date = make_date(
         extract(year  from p.period_month)::int,
         extract(month from p.period_month)::int,
         least(
           t.payment_due_day,
           extract(day from
             (date_trunc('month', p.period_month) + interval '1 month - 1 day')
           )::int
         )
       )
  from public.tenants t
 where p.tenant_id = t.id
   and p.status <> 'paid'
   and t.payment_due_day is not null;

-- 4. Going forward: whenever a NEW payment row is inserted without an
--    explicit due_date, derive it the same way so the app doesn't have to
--    remember the clamp logic.
create or replace function public.payments_default_due_date()
returns trigger
language plpgsql
as $$
declare
  d int;
  last_day int;
begin
  if new.due_date is null and new.period_month is not null then
    select payment_due_day into d from public.tenants where id = new.tenant_id;
    if d is null then
      select payment_due_day into d from public.settings where id = 1;
    end if;
    if d is null then d := 5; end if;
    last_day := extract(day from (date_trunc('month', new.period_month) + interval '1 month - 1 day'))::int;
    new.due_date := make_date(
      extract(year  from new.period_month)::int,
      extract(month from new.period_month)::int,
      least(d, last_day)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_default_due_date on public.payments;
create trigger trg_payments_default_due_date
  before insert on public.payments
  for each row execute function public.payments_default_due_date();

