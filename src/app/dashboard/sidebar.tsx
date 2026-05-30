'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Building2,
  Users,
  Receipt,
  FileText,
  Settings,
  UserCog,
  LogOut,
  Menu,
  BookOpen,
  ShoppingBag,
  CalendarRange,
  Wallet,
  CalendarCheck2,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import type { Role } from '@/lib/types';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, ownerOnly: false },
  { href: '/dashboard/buildings', label: 'Buildings', icon: Building2, ownerOnly: false },
  { href: '/dashboard/tenants', label: 'Tenants', icon: Users, ownerOnly: false },
  { href: '/dashboard/payments', label: 'Payments', icon: Receipt, ownerOnly: false },
  { href: '/dashboard/rent-tracker', label: 'Rent tracker', icon: CalendarCheck2, ownerOnly: false },
  { href: '/dashboard/ledger', label: 'Ledger', icon: BookOpen, ownerOnly: false },
  { href: '/dashboard/store', label: 'Store', icon: ShoppingBag, ownerOnly: false },
  { href: '/dashboard/expenses', label: 'Expenses', icon: Wallet, ownerOnly: false },
  { href: '/dashboard/roster', label: 'Roster', icon: CalendarRange, ownerOnly: false },
  { href: '/dashboard/invoices', label: 'Invoices', icon: FileText, ownerOnly: false },
  { href: '/dashboard/staff', label: 'Staff', icon: UserCog, ownerOnly: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, ownerOnly: true },
];

function NavBody({
  role,
  name,
  onNavigate,
}: {
  role: Role;
  name: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success('Signed out');
    onNavigate?.();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white">
        <div className="font-semibold tracking-tight">Hostel Manager</div>
        <div className="text-xs text-white/85 mt-1">
          {name} · <span className="capitalize">{role}</span>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV.filter((n) => !n.ownerOnly || role === 'owner').map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm'
                  : 'hover:bg-accent'
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-2 border-t">
        <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
          <LogOut className="size-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}

/** Desktop sidebar (hidden on mobile). */
export function Sidebar({ role, name }: { role: Role; name: string }) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 border-r bg-card h-screen sticky top-0">
      <NavBody role={role} name={name} />
    </aside>
  );
}

/** Mobile top bar with hamburger that opens the same nav in a drawer. */
export function MobileTopBar({ role, name }: { role: Role; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-card px-3 h-12">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Open menu"
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <NavBody role={role} name={name} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="font-semibold text-sm">Hostel Manager</div>
    </header>
  );
}

