# Hostel / PG Manager

A complete management web app for a small hostel / PG, built with **Next.js 16 (App Router)**, **Supabase** (Postgres + Auth), **Tailwind CSS** and **shadcn/ui**. Deploy to **Vercel** for free.

## Features

- 🔐 **Auth + role-based access** — Owner & Manager roles via Supabase Auth. Owners can manage everything; managers can't delete records or change settings.
- 🏢 **Multiple buildings & rooms** — Add unlimited buildings, each with their own rooms (number, capacity, rent).
- 👥 **Tenants** — Full KYC: phone, email, Aadhar, PAN, GST, emergency contact, check-in / check-out, status.
- 💰 **Payments** — Record rent payments, mark paid / pending / overdue, due date auto-set from configurable monthly day.
- ⏰ **Auto-overdue** — Daily `pg_cron` job marks `pending` payments past their due date as `overdue`.
- 🧾 **GST Invoices** — Generate, view & **download PDF** invoices with your hostel's name, GSTIN, PAN.
- 📲 **WhatsApp share** — One-click `wa.me` links pre-fill payment reminders / receipts to the tenant's number.
- 📅 **Date-range filtering** — Overview & Payments pages let you filter by any range.
- 📥 **CSV export** — Export tenants & payments to CSV at any time.

## Setup

### 1. Create the Supabase project
1. Go to https://supabase.com → New project.
2. In the SQL editor, paste & run [`supabase/schema.sql`](./supabase/schema.sql). This creates tables, RLS policies, the auto-overdue cron, and the auto-profile trigger.
3. In **Authentication → Providers → Email**, optionally **disable "Confirm email"** so signups log in immediately.
4. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` *(server-only; never expose to the browser)*

### 2. Local environment
```powershell
cp .env.local.example .env.local
# edit .env.local with your three keys
npm install
npm run dev
```
Open http://localhost:3000 and click **Create owner account**. The **first signup automatically becomes the owner**. After that, owners can add managers from `/dashboard/staff`.

### 3. Deploy to Vercel
1. Push to GitHub.
2. https://vercel.com → New Project → import the repo.
3. Add the same three env vars in **Project Settings → Environment Variables**.
4. Deploy.

## Project layout
```
src/
  app/
    page.tsx              # Landing page
    login/                # Sign in
    signup/               # Owner signup (first user only becomes owner)
    dashboard/
      layout.tsx          # Auth-guarded layout + sidebar
      page.tsx            # Overview (date-range filter)
      buildings/          # Buildings & rooms CRUD
      tenants/            # Tenants CRUD + CSV export
      payments/           # Payments CRUD + filters + CSV
      invoices/           # List + [id] detail with PDF & WhatsApp
      staff/              # Owner-only: manage managers
      settings/           # Owner-only: hostel/GST/PAN/due day
    api/staff/route.ts    # Service-role API to create/delete staff
  lib/
    supabase/             # browser / server / admin clients
    types.ts              # DB types
    format.ts             # INR, date, CSV, wa.me helpers
  components/
    date-range-picker.tsx # Reusable URL-synced range picker
    ui/                   # shadcn/ui primitives
  middleware.ts           # Protects /dashboard, redirects auth pages
supabase/schema.sql       # One-shot SQL to bootstrap the DB
```

## Notes

- **WhatsApp**: opens `https://wa.me/<intl phone>?text=<message>` in a new tab. Phone numbers stored as 10-digit IN numbers are automatically prefixed with `91`.
- **PDF**: invoices are rendered client-side via `@react-pdf/renderer` — no server cost.
- **Cron**: requires the `pg_cron` extension which is enabled by default on Supabase. If not, run `create extension pg_cron;` as superuser.

