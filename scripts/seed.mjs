// Seeds the database with a default owner user and sample test data.
//
// Run with:  npm run seed
//
// Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// The SQL in supabase/schema.sql must have been applied first.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// --- Load .env.local manually (no extra deps) ---------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
} catch {
  /* file optional */
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
console.log(`• Supabase URL: ${URL}`);

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// --- Config ------------------------------------------------------------------
const OWNER = {
  email: 'owner@hostel.local',
  password: 'Owner@12345',
  name: 'Default Owner',
  phone: '9999900001',
};

async function ensureOwner() {
  console.log('• Ensuring owner user exists…');
  // List users (page 1) to check if owner already exists
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === OWNER.email);
  let userId;
  if (existing) {
    userId = existing.id;
    console.log(`  ↳ already exists (${userId})`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: OWNER.email,
      password: OWNER.password,
      email_confirm: true,
      user_metadata: { name: OWNER.name, phone: OWNER.phone, role: 'owner' },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`  ↳ created (${userId})`);
  }
  // Make sure profile row exists and is set to owner.
  // The DB trigger only fires for new auth users, so we upsert here in case
  // the user existed before the schema was applied.
  const { error: upErr } = await admin
    .from('profiles')
    .upsert(
      { id: userId, role: 'owner', name: OWNER.name, phone: OWNER.phone },
      { onConflict: 'id' }
    );
  if (upErr) console.warn('  ! profile upsert warning:', upErr.message);
  return userId;
}

async function ensureSettings() {
  console.log('• Updating settings…');
  const { error } = await admin
    .from('settings')
    .update({
      hostel_name: 'Rishi PG',
      hostel_address: '12, MG Road, Bengaluru, KA 560001',
      hostel_phone: '9999900001',
      hostel_email: 'owner@hostel.local',
      hostel_gst: '29ABCDE1234F1Z5',
      hostel_pan: 'ABCDE1234F',
      payment_due_day: 5,
      invoice_prefix: 'INV',
    })
    .eq('id', 1);
  if (error) console.warn('  ! settings update warning:', error.message);
}

async function ensureBuildings() {
  console.log('• Ensuring buildings…');
  const wanted = [
    { name: 'Building A', address: 'Block A, MG Road' },
    { name: 'Building B', address: 'Block B, MG Road' },
  ];
  const { data: existing } = await admin.from('buildings').select('id,name');
  const byName = new Map((existing ?? []).map((b) => [b.name, b.id]));
  const result = {};
  for (const w of wanted) {
    if (byName.has(w.name)) {
      result[w.name] = byName.get(w.name);
      console.log(`  ↳ ${w.name}: existing`);
    } else {
      const { data, error } = await admin.from('buildings').insert(w).select('id').single();
      if (error) throw error;
      result[w.name] = data.id;
      console.log(`  ↳ ${w.name}: created`);
    }
  }
  return result;
}

async function ensureRooms(buildings) {
  console.log('• Ensuring rooms…');
  const wanted = [
    { building: 'Building A', room_number: 'A-101', capacity: 2, monthly_rent: 6500 },
    { building: 'Building A', room_number: 'A-102', capacity: 1, monthly_rent: 8500 },
    { building: 'Building A', room_number: 'A-103', capacity: 2, monthly_rent: 6500 },
    { building: 'Building B', room_number: 'B-201', capacity: 1, monthly_rent: 9000 },
    { building: 'Building B', room_number: 'B-202', capacity: 2, monthly_rent: 7000 },
  ];
  const { data: existing } = await admin.from('rooms').select('id,room_number,building_id');
  const byKey = new Map((existing ?? []).map((r) => [`${r.building_id}|${r.room_number}`, r.id]));
  const result = {};
  for (const w of wanted) {
    const bId = buildings[w.building];
    const key = `${bId}|${w.room_number}`;
    if (byKey.has(key)) {
      result[w.room_number] = byKey.get(key);
      console.log(`  ↳ ${w.room_number}: existing`);
    } else {
      const { data, error } = await admin
        .from('rooms')
        .insert({
          building_id: bId,
          room_number: w.room_number,
          capacity: w.capacity,
          monthly_rent: w.monthly_rent,
        })
        .select('id')
        .single();
      if (error) throw error;
      result[w.room_number] = data.id;
      console.log(`  ↳ ${w.room_number}: created`);
    }
  }
  return result;
}

async function ensureTenants(rooms) {
  console.log('• Ensuring tenants…');
  const today = new Date();
  const last = (n) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
  };
  const wanted = [
    {
      name: 'Aarav Sharma', phone: '9810000001', email: 'aarav@example.com',
      room: 'A-101', aadhar: '1111-2222-3333', pan: 'ABCPS1234A', gst_number: null,
      emergency_contact: 'Father: 9810000010', check_in_date: last(3), status: 'active',
    },
    {
      name: 'Ishita Verma', phone: '9810000002', email: 'ishita@example.com',
      room: 'A-102', aadhar: '2222-3333-4444', pan: 'XYZPV5678B', gst_number: '29XYZPV5678B1ZA',
      emergency_contact: 'Sister: 9810000020', check_in_date: last(6), status: 'active',
    },
    {
      name: 'Rohan Mehta', phone: '9810000003', email: 'rohan@example.com',
      room: 'B-201', aadhar: '3333-4444-5555', pan: 'PQRSM9012C', gst_number: null,
      emergency_contact: 'Mother: 9810000030', check_in_date: last(2), status: 'active',
    },
    {
      name: 'Neha Singh', phone: '9810000004', email: 'neha@example.com',
      room: 'B-202', aadhar: '4444-5555-6666', pan: 'LMNNS3456D', gst_number: null,
      emergency_contact: 'Brother: 9810000040', check_in_date: last(1), status: 'active',
    },
  ];
  const { data: existing } = await admin.from('tenants').select('id,name');
  const byName = new Map((existing ?? []).map((t) => [t.name, t.id]));
  const result = [];
  for (const w of wanted) {
    if (byName.has(w.name)) {
      result.push({ ...w, id: byName.get(w.name) });
      console.log(`  ↳ ${w.name}: existing`);
    } else {
      const { data, error } = await admin
        .from('tenants')
        .insert({
          name: w.name, phone: w.phone, email: w.email,
          room_id: rooms[w.room], aadhar: w.aadhar, pan: w.pan, gst_number: w.gst_number,
          emergency_contact: w.emergency_contact, check_in_date: w.check_in_date,
          status: w.status,
        })
        .select('id')
        .single();
      if (error) throw error;
      result.push({ ...w, id: data.id });
      console.log(`  ↳ ${w.name}: created`);
    }
  }
  return result;
}

async function ensurePayments(tenants, rooms) {
  console.log('• Ensuring payments (current & past month)…');
  const { data: existing } = await admin.from('payments').select('tenant_id,period_month');
  const seen = new Set((existing ?? []).map((p) => `${p.tenant_id}|${p.period_month}`));

  const rentByRoom = {
    'A-101': 6500, 'A-102': 8500, 'A-103': 6500,
    'B-201': 9000, 'B-202': 7000,
  };

  const today = new Date();
  const currMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const due = (d, day) => new Date(d.getFullYear(), d.getMonth(), day).toISOString().slice(0, 10);
  const iso = (d) => d.toISOString().slice(0, 10);

  const rows = [];
  for (let i = 0; i < tenants.length; i++) {
    const t = tenants[i];
    const amount = rentByRoom[t.room];
    // Last month → paid
    rows.push({
      tenant_id: t.id, amount, period_month: iso(prevMonth),
      due_date: due(prevMonth, 5), paid_date: due(prevMonth, 3),
      payment_mode: ['upi', 'cash', 'bank_transfer', 'upi'][i] ?? 'upi',
      status: 'paid', notes: 'Auto-seeded',
    });
    // Current month → mix of pending / overdue / paid
    const statuses = ['pending', 'overdue', 'paid', 'pending'];
    const status = statuses[i % statuses.length];
    rows.push({
      tenant_id: t.id, amount, period_month: iso(currMonth),
      due_date: due(currMonth, 5),
      paid_date: status === 'paid' ? due(currMonth, 4) : null,
      payment_mode: status === 'paid' ? 'upi' : null,
      status,
      notes: 'Auto-seeded',
    });
  }

  const toInsert = rows.filter((r) => !seen.has(`${r.tenant_id}|${r.period_month}`));
  if (toInsert.length === 0) {
    console.log('  ↳ all already present');
    return;
  }
  const { error } = await admin.from('payments').insert(toInsert);
  if (error) throw error;
  console.log(`  ↳ inserted ${toInsert.length} payments`);
}

async function main() {
  await ensureOwner();
  await ensureSettings();
  const buildings = await ensureBuildings();
  const rooms = await ensureRooms(buildings);
  const tenants = await ensureTenants(rooms);
  await ensurePayments(tenants, rooms);

  console.log('\n✅ Seed complete.');
  console.log('   Login at  http://localhost:3000/login');
  console.log(`   Email:    ${OWNER.email}`);
  console.log(`   Password: ${OWNER.password}\n`);
}

main().catch((e) => {
  console.error('\n❌ Seed failed:', e.message ?? e);
  console.error('   Did you apply supabase/schema.sql to the database first?');
  process.exit(1);
});

