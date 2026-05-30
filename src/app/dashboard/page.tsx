import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { DateRangePicker } from '@/components/date-range-picker';
import { formatINR, monthStart, toISODate } from '@/lib/format';
import { startOfMonth, endOfMonth } from 'date-fns';
import {
  Building2, Users, Receipt, AlertTriangle, UserPlus, BedDouble,
  CreditCard, Wallet, Settings as SettingsIcon, CalendarCheck2,
} from 'lucide-react';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from ? new Date(sp.from) : startOfMonth(new Date());
  const to = sp.to ? new Date(sp.to) : endOfMonth(new Date());
  const fromISO = toISODate(from);
  const toISO = toISODate(to);

  const supabase = await createClient();
  const [
    { count: tenantCount },
    { count: activeTenantCount },
    { count: buildingCount },
    { count: roomCount },
    { data: paymentsInRange },
    { data: overduePayments },
    { data: buildingsData },
    { data: roomsData },
    { data: activeTenantsData },
  ] = await Promise.all([
    supabase.from('tenants').select('*', { head: true, count: 'exact' }),
    supabase.from('tenants').select('*', { head: true, count: 'exact' }).eq('status', 'active'),
    supabase.from('buildings').select('*', { head: true, count: 'exact' }),
    supabase.from('rooms').select('*', { head: true, count: 'exact' }),
    supabase
      .from('payments')
      .select('amount,status,due_date')
      .gte('due_date', fromISO)
      .lte('due_date', toISO),
    supabase
      .from('payments')
      .select('id, amount, due_date, tenant:tenants(name, phone)')
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .limit(10),
    supabase.from('buildings').select('id, name').order('name'),
    supabase.from('rooms').select('id, building_id, capacity'),
    supabase.from('tenants').select('room_id').eq('status', 'active'),
  ]);

  // Vacancy stats per building
  const occByRoom = new Map<string, number>();
  for (const t of (activeTenantsData ?? []) as { room_id: string | null }[]) {
    if (t.room_id) occByRoom.set(t.room_id, (occByRoom.get(t.room_id) ?? 0) + 1);
  }
  const vacancyByBuilding = ((buildingsData ?? []) as { id: string; name: string }[]).map((b) => {
    const bRooms = ((roomsData ?? []) as { id: string; building_id: string; capacity: number }[])
      .filter((r) => r.building_id === b.id);
    const capacity = bRooms.reduce((s, r) => s + (r.capacity ?? 0), 0);
    const occupied = bRooms.reduce((s, r) => s + (occByRoom.get(r.id) ?? 0), 0);
    const available = Math.max(0, capacity - occupied);
    return { id: b.id, name: b.name, rooms: bRooms.length, capacity, occupied, available };
  });
  const totalCapacity = vacancyByBuilding.reduce((s, b) => s + b.capacity, 0);
  const totalAvailable = vacancyByBuilding.reduce((s, b) => s + b.available, 0);
  const occupancyPct = totalCapacity > 0
    ? Math.round(((totalCapacity - totalAvailable) / totalCapacity) * 100)
    : 0;

  const totalCollected = (paymentsInRange ?? [])
    .filter(p => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = (paymentsInRange ?? [])
    .filter(p => p.status !== 'paid')
    .reduce((s, p) => s + Number(p.amount), 0);
  const overdueCount = (paymentsInRange ?? []).filter(p => p.status === 'overdue').length;

  const cards = [
    { title: 'Buildings', value: buildingCount ?? 0, icon: Building2 },
    { title: 'Rooms',     value: roomCount ?? 0,     icon: Building2 },
    { title: 'Active tenants', value: `${activeTenantCount ?? 0} / ${tenantCount ?? 0}`, icon: Users },
    { title: 'Overdue payments (range)', value: overdueCount, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">Showing data for the selected date range.</p>
        </div>
        <DateRangePicker defaultRange={{ from: monthStart(), to: endOfMonth(new Date()) }} />
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Link
              href="/dashboard/tenants"
              className={buttonVariants({ variant: 'default', size: 'sm' }) + ' justify-start'}
            >
              <UserPlus className="size-4 mr-1" /> Add tenant
            </Link>
            <Link
              href="/dashboard/buildings"
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' justify-start'}
            >
              <Building2 className="size-4 mr-1" /> Buildings
            </Link>
            <Link
              href="/dashboard/payments"
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' justify-start'}
            >
              <CreditCard className="size-4 mr-1" /> Record payment
            </Link>
            <Link
              href="/dashboard/rent-tracker"
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' justify-start'}
              title="Paid-till timeline per tenant"
            >
              <CalendarCheck2 className="size-4 mr-1" /> Rent tracker
            </Link>
            <Link
              href="/dashboard/expenses"
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' justify-start'}
            >
              <Wallet className="size-4 mr-1" /> Log expense
            </Link>
            <Link
              href="/dashboard/store"
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' justify-start'}
            >
              <Receipt className="size-4 mr-1" /> Store sale
            </Link>
            <Link
              href="/dashboard/settings"
              className={buttonVariants({ variant: 'ghost', size: 'sm' }) + ' justify-start'}
              title="Edit WhatsApp templates & business details"
            >
              <SettingsIcon className="size-4 mr-1" /> Settings
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ title, value, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vacancies by building */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BedDouble className="size-4 text-muted-foreground" />
            Vacancies by building
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {totalAvailable} available · {occupancyPct}% occupied
          </div>
        </CardHeader>
        <CardContent>
          {vacancyByBuilding.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No buildings yet. <Link href="/dashboard/buildings" className="underline">Add one</Link>.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vacancyByBuilding.map((b) => {
                const isFull = b.capacity > 0 && b.available === 0;
                const pct = b.capacity > 0
                  ? Math.round(((b.capacity - b.available) / b.capacity) * 100)
                  : 0;
                return (
                  <Link
                    key={b.id}
                    href="/dashboard/buildings"
                    className="block rounded-lg border p-3 hover:bg-muted/40 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium truncate">{b.name}</div>
                      {isFull ? (
                        <Badge variant="destructive">Full</Badge>
                      ) : b.available <= 2 && b.capacity > 0 ? (
                        <Badge variant="secondary">Almost full</Badge>
                      ) : (
                        <Badge variant="default">{b.available} free</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {b.rooms} rooms · {b.occupied} / {b.capacity} beds
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded mt-2">
                      <div
                        className={`h-1.5 rounded ${pct >= 100 ? 'bg-amber-500' : pct >= 80 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Collected vs Pending (range)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between"><span>Collected</span><span className="font-semibold text-green-600">{formatINR(totalCollected)}</span></div>
            <div className="flex justify-between"><span>Pending + Overdue</span><span className="font-semibold text-amber-600">{formatINR(totalPending)}</span></div>
            <div className="flex justify-between border-t pt-2"><span>Total billed</span><span className="font-semibold">{formatINR(totalCollected + totalPending)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Receipt className="size-4" /><CardTitle>Recent overdue</CardTitle>
          </CardHeader>
          <CardContent>
            {overduePayments && overduePayments.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {overduePayments.map(p => {
                  // p.tenant is an array because of FK select syntax
                  const tenant = Array.isArray(p.tenant) ? p.tenant[0] : p.tenant;
                  return (
                    <li key={p.id} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                      <span>{tenant?.name ?? 'Unknown'}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="destructive">Overdue</Badge>
                        <span className="font-medium">{formatINR(p.amount)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No overdue payments. 🎉</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

