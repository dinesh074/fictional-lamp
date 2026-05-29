import { getUserAndProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TenantsClient } from './tenants-client';

export default async function TenantsPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <TenantsClient role={profile.role} />;
}

