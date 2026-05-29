import { redirect } from 'next/navigation';
import { getUserAndProfile } from '@/lib/supabase/server';
import { Sidebar, MobileTopBar } from './sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect('/login');
  if (!profile) redirect('/login?error=no-profile');

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar role={profile.role} name={profile.name} />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar role={profile.role} name={profile.name} />
        <main className="flex-1 min-w-0 overflow-x-auto">
          <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

