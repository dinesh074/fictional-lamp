-- =====================================================================
-- Migration: per-tenant payment due day + tenant photos
-- Run AFTER schema.sql, in Supabase SQL Editor.
-- Re-runnable.
-- =====================================================================

-- 1) Per-tenant override for payment due day (1-28). NULL = use settings.payment_due_day.
alter table public.tenants
  add column if not exists payment_due_day int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_payment_due_day_check'
  ) then
    alter table public.tenants
      add constraint tenants_payment_due_day_check
      check (payment_due_day is null or (payment_due_day between 1 and 28));
  end if;
end $$;

-- 2) Photo (object path inside the 'tenant-photos' bucket).
alter table public.tenants
  add column if not exists photo_url text;

-- 3) Public storage bucket for tenant photos.
insert into storage.buckets (id, name, public)
values ('tenant-photos', 'tenant-photos', true)
on conflict (id) do nothing;

-- 4) Storage policies: public read, staff write, owner delete.
drop policy if exists "tenant-photos read"   on storage.objects;
drop policy if exists "tenant-photos write"  on storage.objects;
drop policy if exists "tenant-photos update" on storage.objects;
drop policy if exists "tenant-photos delete" on storage.objects;

create policy "tenant-photos read" on storage.objects
  for select using (bucket_id = 'tenant-photos');

create policy "tenant-photos write" on storage.objects
  for insert with check (
    bucket_id = 'tenant-photos' and public.is_authenticated_staff()
  );

create policy "tenant-photos update" on storage.objects
  for update using (
    bucket_id = 'tenant-photos' and public.is_authenticated_staff()
  );

create policy "tenant-photos delete" on storage.objects
  for delete using (
    bucket_id = 'tenant-photos' and public.is_owner()
  );

