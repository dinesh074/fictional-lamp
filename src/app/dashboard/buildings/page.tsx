import { getUserAndProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BuildingsClient } from './buildings-client';

export default async function BuildingsPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <BuildingsClient role={profile.role} />;
}

