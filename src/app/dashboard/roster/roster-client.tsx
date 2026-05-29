'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Printer } from 'lucide-react';
import { startOfMonth, endOfMonth, addMonths, format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { downloadCSV, formatINR, formatDate, toISODate } from '@/lib/format';
import { tenantOnHold } from '@/lib/dues';
import type { Building, Payment, Role, StoreSale, Tenant, LedgerEntry, Expense } from '@/lib/types';

interface Row {
  tenant: Tenant;
  building: string;
  room: string;
  rent: number;
  paidStatus: 'paid' | 'pending' | 'overdue' | 'none';
  paymentAmount: number;
  storeTotal: number;
  ledgerBalance: number | null;
  onHold: boolean;
}

export function RosterClient({ role: _role }: { role: Role }) {
  const supabase = createClient();
  const [month, setMonth] = useState<string>(toISODate(startOfMonth(new Date())).slice(0, 7));
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const periodStart = `${month}-01`;
    const periodEnd = toISODate(endOfMonth(new Date(periodStart)));
    const nextPeriod = toISODate(startOfMonth(addMonths(new Date(periodStart), 1)));

    const [tRes, pRes, sRes, lRes, bRes, eRes] = await Promise.all([
      supabase.from('tenants').select('*, room:rooms(*,building:buildings(*))').eq('status', 'active').order('name'),
      supabase.from('payments').select('*').gte('period_month', periodStart).lt('period_month', nextPeriod),
      supabase.from('store_sales').select('*').gte('sale_date', periodStart).lte('sale_date', periodEnd),
      supabase
        .from('ledger_entries')
        .select('tenant_id, balance_after, entry_date, created_at')
        .lte('entry_date', periodEnd)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('buildings').select('*').order('name'),
      supabase.from('expenses').select('*').gte('expense_date', periodStart).lte('expense_date', periodEnd),
    ]);
    if (tRes.error) toast.error(tRes.error.message);

    const tenants = (tRes.data as Tenant[]) ?? [];
    const payments = (pRes.data as Payment[]) ?? [];
    const sales = (sRes.data as StoreSale[]) ?? [];
    const ledger = (lRes.data as Pick<LedgerEntry, 'tenant_id' | 'balance_after' | 'entry_date' | 'created_at'>[]) ?? [];
    setBuildings((bRes.data as Building[]) ?? []);
    setExpenses((eRes.data as Expense[]) ?? []);

    const lastBalance = new Map<string, number>();
    for (const e of ledger) {
      if (!lastBalance.has(e.tenant_id) && e.balance_after !== null) {
        lastBalance.set(e.tenant_id, Number(e.balance_after));
      }
    }

    const out: Row[] = tenants.map((t) => {
      const p = payments.find((x) => x.tenant_id === t.id);
      const store = sales.filter((s) => s.tenant_id === t.id).reduce((s, x) => s + Number(x.total), 0);
      return {
        tenant: t,
        building: t.room?.building?.name ?? '—',
        room: t.room?.room_number ?? '—',
        rent: Number(t.room?.monthly_rent ?? 0),
        paidStatus: (p?.status ?? 'none') as Row['paidStatus'],
        paymentAmount: p ? Number(p.amount) : 0,
        storeTotal: store,
        ledgerBalance: lastBalance.get(t.id) ?? null,
        onHold: tenantOnHold(t),
      };
    });
    setRows(out);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const filtered = useMemo(
    () => buildingFilter === 'all' ? rows : rows.filter((r) => r.tenant.room?.building?.id === buildingFilter),
    [rows, buildingFilter]
  );

  const totals = useMemo(() => {
    const expensesPaid = expenses
      .filter((x) => x.status === 'paid' &&
        (buildingFilter === 'all' || !x.building_id || x.building_id === buildingFilter))
      .reduce((s, x) => s + Number(x.amount), 0);
    const base = filtered.reduce((acc, r) => {
      acc.rent += r.rent;
      acc.paid += r.paidStatus === 'paid' ? r.paymentAmount : 0;
      acc.due +=
        (r.paidStatus === 'pending' || r.paidStatus === 'overdue' || r.paidStatus === 'none')
          ? (r.paymentAmount || r.rent)
          : 0;
      acc.store += r.storeTotal;
      return acc;
    }, { rent: 0, paid: 0, due: 0, store: 0 });
    return { ...base, expensesPaid, net: base.paid + base.store - expensesPaid };
  }, [filtered, expenses, buildingFilter]);

  function exportCSV() {
    downloadCSV(
      filtered.map((r) => ({
        Tenant: r.tenant.name,
        Phone: r.tenant.phone ?? '',
        Building: r.building,
        Room: r.room,
        JoinDate: r.tenant.check_in_date ?? '',
        DueDay: r.tenant.payment_due_day ?? '',
        Rent: r.rent,
        PaymentStatus: r.paidStatus,
        PaymentAmount: r.paymentAmount,
        StoreThisMonth: r.storeTotal,
        LedgerBalance: r.ledgerBalance ?? '',
        OnHold: r.onHold ? 'yes' : '',
      })),
      `roster-${month}.csv`
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Monthly roster</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(`${month}-01`), 'MMMM yyyy')} · everyone, everywhere.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-auto"
          />
          <select
            className="border rounded-md h-9 px-2 bg-background text-sm"
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
          >
            <option value="all">All buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4 mr-1" />CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4 mr-1" />Print
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total rent roll</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatINR(totals.rent)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Collected</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{formatINR(totals.paid)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Outstanding</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{formatINR(totals.due)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Store sales</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatINR(totals.store)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Expenses paid</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{formatINR(totals.expensesPaid)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Net (P&amp;L)</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totals.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatINR(totals.net)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Tenants ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Bldg/Room</TableHead>
                <TableHead>Join</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Rent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Store ₹</TableHead>
                <TableHead className="text-right">Ledger bal.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={8}>Loading…</TableCell></TableRow>}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground">No tenants.</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.tenant.id} className={r.onHold ? 'opacity-60' : ''}>
                  <TableCell className="font-medium">
                    {r.tenant.name}
                    {r.onHold && <Badge variant="secondary" className="ml-1 text-[10px]">hold</Badge>}
                    <div className="text-xs text-muted-foreground">{r.tenant.phone ?? ''}</div>
                  </TableCell>
                  <TableCell>{r.building} / {r.room}</TableCell>
                  <TableCell>{formatDate(r.tenant.check_in_date)}</TableCell>
                  <TableCell>{r.tenant.payment_due_day ?? '-'}</TableCell>
                  <TableCell className="text-right">{formatINR(r.rent)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.paidStatus === 'paid'
                          ? 'default'
                          : r.paidStatus === 'overdue'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {r.paidStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.storeTotal ? formatINR(r.storeTotal) : '-'}</TableCell>
                  <TableCell className="text-right">
                    {r.ledgerBalance !== null ? formatINR(r.ledgerBalance) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

