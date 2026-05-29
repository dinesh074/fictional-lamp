import { getUserAndProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ExpensesClient } from './expenses-client';

export default async function ExpensesPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <ExpensesClient role={profile.role} />;
}

