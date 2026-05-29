-- =====================================================================
-- Migration: notifications log (WhatsApp wa.me clicks, etc.). Re-runnable.
-- =====================================================================

create table if not exists public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  channel text not null check (channel in ('whatsapp','sms','email','manual')) default 'whatsapp',
  template text,
  message text,
  status text not null check (status in ('queued','sent','clicked','failed','skipped')) default 'sent',
  error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notif_tenant_date
  on public.notifications_log(tenant_id, created_at desc);

alter table public.notifications_log enable row level security;

drop policy if exists notif_select on public.notifications_log;
create policy notif_select on public.notifications_log
  for select using (public.is_authenticated_staff());

drop policy if exists notif_insert on public.notifications_log;
create policy notif_insert on public.notifications_log
  for insert with check (public.is_authenticated_staff());

drop policy if exists notif_delete on public.notifications_log;
create policy notif_delete on public.notifications_log
  for delete using (public.is_owner());

