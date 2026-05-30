import { redirect } from 'next/navigation';
import { getUserAndProfile } from '@/lib/supabase/server';
import { RentTrackerClient } from './rent-tracker-client';

export default async function RentTrackerPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <RentTrackerClient role={profile.role} />;
}

