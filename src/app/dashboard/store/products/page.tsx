import { getUserAndProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProductsClient } from './products-client';

export default async function ProductsPage() {
  const { profile } = await getUserAndProfile();
  if (!profile) redirect('/login');
  return <ProductsClient role={profile.role} />;
}

