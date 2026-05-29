-- =====================================================================
-- Migration: hostel-side EXPENSES (purchases, utility bills, salaries…)
-- Separate from tenant ledger (which tracks receivables).
-- Re-runnable.
-- =====================================================================

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null check (category in (
    'purchase',         -- groceries / supplies bought for the hostel
    'utility_bill',     -- electricity, water, internet, gas, cable…
    'salary',           -- staff salary
    'rent',             -- hostel building rent paid by owner
    'maintenance',      -- repairs, plumbing, cleaning
    'tax',              -- GST, property tax
    'other'
  )),
  subcategory text,                                       -- 'electricity', 'water', …
  vendor_name text,                                       -- who got paid
  staff_id uuid references public.profiles(id) on delete set null,  -- for salary rows
  building_id uuid references public.buildings(id) on delete set null,
  amount numeric(12,2) not null,
  payment_method text check (payment_method in ('cash','upi','bank_transfer','card','cheque','other')),
  status text not null check (status in ('paid','pending','scheduled')) default 'paid',
  paid_date date,
  description text,
  receipt_url text,                                       -- object path in 'expense-receipts'
  -- Recurring bills (e.g. monthly electricity)
  recurring boolean not null default false,
  recurring_period text check (recurring_period in ('weekly','monthly','quarterly','yearly')),
  next_due_date date,
  parent_expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on public.expenses(expense_date desc);
create index if not exists idx_expenses_category on public.expenses(category);
create index if not exists idx_expenses_building on public.expenses(building_id);
create index if not exists idx_expenses_status on public.expenses(status);
create index if not exists idx_expenses_recurring on public.expenses(recurring, next_due_date)
  where recurring = true;

-- Storage bucket for receipt photos (compressed client-side to ≤150 KB).
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', true)
on conflict (id) do nothing;

drop policy if exists "expense-receipts read"   on storage.objects;
drop policy if exists "expense-receipts write"  on storage.objects;
drop policy if exists "expense-receipts update" on storage.objects;
drop policy if exists "expense-receipts delete" on storage.objects;

create policy "expense-receipts read" on storage.objects
  for select using (bucket_id = 'expense-receipts');
create policy "expense-receipts write" on storage.objects
  for insert with check (bucket_id = 'expense-receipts' and public.is_authenticated_staff());
create policy "expense-receipts update" on storage.objects
  for update using (bucket_id = 'expense-receipts' and public.is_authenticated_staff());
create policy "expense-receipts delete" on storage.objects
  for delete using (bucket_id = 'expense-receipts' and public.is_owner());

-- RLS
alter table public.expenses enable row level security;

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (public.is_authenticated_staff());

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (public.is_authenticated_staff());

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (public.is_authenticated_staff());

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (public.is_owner());

-- Helper: monthly P&L view (rent collected + store revenue) − expenses paid.
create or replace view public.monthly_pnl as
with months as (
  select date_trunc('month', expense_date)::date as m from public.expenses
  union
  select date_trunc('month', paid_date)::date as m from public.payments where paid_date is not null
  union
  select date_trunc('month', sale_date)::date as m from public.store_sales
)
select
  m.m as month,
  coalesce((select sum(amount) from public.payments
            where status = 'paid' and date_trunc('month', paid_date) = m.m), 0) as rent_collected,
  coalesce((select sum(total) from public.store_sales
            where date_trunc('month', sale_date) = m.m), 0) as store_revenue,
  coalesce((select sum(amount) from public.expenses
            where status = 'paid' and date_trunc('month', paid_date) = m.m), 0) as expenses_paid,
  coalesce((select sum(amount) from public.expenses
            where status in ('pending','scheduled') and date_trunc('month', expense_date) = m.m), 0) as expenses_pending
from months m
order by m.m desc;

