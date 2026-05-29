import { getUserAndProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PaymentsClient } from './payments-client';

export default async function PaymentsPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <PaymentsClient role={profile.role} />;
}

