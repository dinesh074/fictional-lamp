import { getUserAndProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StoreClient } from './store-client';

export default async function StorePage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <StoreClient role={profile.role} />;
}

