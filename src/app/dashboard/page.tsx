import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/date-range-picker';
import { formatINR, monthStart, toISODate } from '@/lib/format';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Building2, Users, Receipt, AlertTriangle } from 'lucide-react';

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
  ]);

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

