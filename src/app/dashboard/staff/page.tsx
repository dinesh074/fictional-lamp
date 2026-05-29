import { redirect } from 'next/navigation';
import { getUserAndProfile } from '@/lib/supabase/server';
import { StaffClient } from './staff-client';

export default async function StaffPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) redirect('/login');
  if (profile.role !== 'owner') redirect('/dashboard');
  return <StaffClient currentUserId={user.id} />;
}

