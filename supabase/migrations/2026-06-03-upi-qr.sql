-- =====================================================================
-- Migration: UPI QR image on settings
-- Re-runnable. Adds a column to store the storage path to a QR code image
-- (uploaded by the hostel owner) plus a public bucket to hold the files.
-- =====================================================================

alter table public.settings
  add column if not exists upi_qr_url text;

-- Public storage bucket so the tenant's WhatsApp can preview the QR
-- directly from the URL without auth.
insert into storage.buckets (id, name, public)
values ('upi-qr', 'upi-qr', true)
on conflict (id) do update set public = true;

-- Anyone can READ (so wa.me previews work). Only authenticated users can
-- write/update/delete (hostel admin / owner).
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'upi-qr read'
  ) then
    create policy "upi-qr read" on storage.objects
      for select using (bucket_id = 'upi-qr');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'upi-qr write'
  ) then
    create policy "upi-qr write" on storage.objects
      for insert with check (bucket_id = 'upi-qr' and auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'upi-qr update'
  ) then
    create policy "upi-qr update" on storage.objects
      for update using (bucket_id = 'upi-qr' and auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'upi-qr delete'
  ) then
    create policy "upi-qr delete" on storage.objects
      for delete using (bucket_id = 'upi-qr' and auth.role() = 'authenticated');
  end if;
end $$;

