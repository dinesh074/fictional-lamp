import { redirect } from 'next/navigation';
import { getUserAndProfile, createClient } from '@/lib/supabase/server';
import { SettingsClient } from './settings-client';
import type { Settings } from '@/lib/types';

export default async function SettingsPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'owner') redirect('/dashboard');

  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
  return <SettingsClient initial={(data as Settings) ?? {
    id: 1, hostel_name: 'My Hostel', hostel_address: null, hostel_gst: null, hostel_pan: null,
    hostel_phone: null, hostel_email: null, payment_due_day: 5, invoice_prefix: 'INV', invoice_counter: 1,
  }} />;
}

