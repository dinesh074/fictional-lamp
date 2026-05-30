-- =====================================================================
-- Migration: configurable WhatsApp message templates.
-- Admin (Settings page) can edit/enable/disable; staff pick a template
-- when clicking the WhatsApp icon on a tenant row.
-- Re-runnable.
-- =====================================================================

create table if not exists public.wa_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,             -- machine key, e.g. 'payment_due'
  label text not null,                  -- shown in the picker
  category text not null check (category in (
    'payment', 'invitation', 'celebration', 'offer', 'availability', 'generic'
  )) default 'generic',
  body text not null,                   -- supports {{placeholders}}
  enabled boolean not null default true,
  sort_order int not null default 100,
  is_system boolean not null default false,  -- seeded rows: cannot be deleted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_templates_enabled on public.wa_templates(enabled);
create index if not exists idx_wa_templates_category on public.wa_templates(category);

create or replace function public.touch_wa_templates_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_wa_templates_touch on public.wa_templates;
create trigger trg_wa_templates_touch before update on public.wa_templates
  for each row execute function public.touch_wa_templates_updated_at();

-- Seed default templates (idempotent on key)
insert into public.wa_templates (key, label, category, body, sort_order, is_system) values
  ('payment_due', 'Payment due (reminder)', 'payment',
   'Hi {{tenant_name}}, gentle reminder: your rent of {{amount}} for {{period_month}} is due on {{due_date}}.{{upi_line}}'
   || E'\n— {{hostel_name}}.{{contact_line}}', 10, true),

  ('payment_overdue', 'Payment overdue (notice)', 'payment',
   'Hi {{tenant_name}}, your rent of {{amount}} for {{period_month}} is OVERDUE (was due {{due_date}}). Please clear at the earliest.{{upi_line}}'
   || E'\n— {{hostel_name}}.{{contact_line}}', 20, true),

  ('payment_request', 'Payment request', 'payment',
   'Hi {{tenant_name}}, please pay {{amount}} for {{period_month}}.{{upi_line}}'
   || E'\nThank you! — {{hostel_name}}.', 30, true),

  ('payment_received', 'Payment received (thank you)', 'payment',
   'Hi {{tenant_name}}, we have received your payment of {{amount}} for {{period_month}}. Thank you!'
   || E'\n— {{hostel_name}}.', 40, true),

  ('invitation', 'Invitation', 'invitation',
   'Hi {{tenant_name}}, you are invited to {{event_name}} on {{event_date}}. We''d love to see you there!'
   || E'\n— {{hostel_name}}.', 50, true),

  ('celebration', 'Celebration / festival wishes', 'celebration',
   'Hi {{tenant_name}}, wishing you and your family a very happy {{occasion}} from all of us at {{hostel_name}}! 🎉', 60, true),

  ('offer', 'Special offer', 'offer',
   'Hi {{tenant_name}}, special offer for our residents: {{offer_details}}. Valid till {{valid_till}}.'
   || E'\n— {{hostel_name}}.', 70, true),

  ('availability', 'Room availability (referral)', 'availability',
   'Hi {{tenant_name}}, we currently have {{available_beds}} beds available at {{hostel_name}} ({{building_summary}}). If you know anyone looking for accommodation, please refer them!{{contact_line}}', 80, true),

  ('generic', 'Generic / blank', 'generic',
   'Hi {{tenant_name}}, a message from {{hostel_name}}.{{contact_line}}', 100, true)
on conflict (key) do update set
  label     = excluded.label,
  category  = excluded.category,
  is_system = true;
  -- Note: body / enabled / sort_order are intentionally NOT overwritten,
  -- so admin customisations from the Settings page are preserved on re-run.

-- RLS
alter table public.wa_templates enable row level security;

drop policy if exists wa_templates_select on public.wa_templates;
create policy wa_templates_select on public.wa_templates
  for select using (public.is_authenticated_staff());

drop policy if exists wa_templates_insert on public.wa_templates;
create policy wa_templates_insert on public.wa_templates
  for insert with check (public.is_owner());

drop policy if exists wa_templates_update on public.wa_templates;
create policy wa_templates_update on public.wa_templates
  for update using (public.is_owner());

drop policy if exists wa_templates_delete on public.wa_templates;
create policy wa_templates_delete on public.wa_templates
  for delete using (public.is_owner() and is_system = false);

