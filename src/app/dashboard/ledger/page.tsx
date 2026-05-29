import { getUserAndProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LedgerClient } from './ledger-client';

export default async function LedgerPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <LedgerClient role={profile.role} />;
}

