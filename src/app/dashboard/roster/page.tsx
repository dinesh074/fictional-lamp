import { getUserAndProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RosterClient } from './roster-client';

export default async function RosterPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <RosterClient role={profile.role} />;
}

