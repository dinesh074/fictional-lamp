'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Download, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { downloadCSV, formatDate, formatINR } from '@/lib/format';
import type { LedgerEntry, LedgerType, Role, Tenant, Expense } from '@/lib/types';

const TYPES: LedgerType[] = ['charge', 'payment', 'adjustment', 'store_purchase', 'refund'];

export function LedgerClient({ role }: { role: Role }) {
  const supabase = createClient();
  const sp = useSearchParams();
  const tenantParam = sp.get('tenant') ?? 'all';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tenantFilter, setTenantFilter] = useState<string>(tenantParam);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [adj, setAdj] = useState({
    tenant_id: '',
    amount: 0,
    notes: '',
    entry_date: new Date().toISOString().slice(0, 10),
  });

  async function load() {
    setLoading(true);
    let q = supabase
      .from('ledger_entries')
      .select('*, tenant:tenants(id,name)')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (tenantFilter !== 'all') q = q.eq('tenant_id', tenantFilter);
    if (typeFilter !== 'all') q = q.eq('type', typeFilter);
    if (from) q = q.gte('entry_date', from);
    if (to) q = q.lte('entry_date', to);
    const [e, t] = await Promise.all([
      q,
      supabase.from('tenants').select('id,name').order('name'),
    ]);
    if (e.error) toast.error(e.error.message);
    setEntries((e.data as LedgerEntry[]) ?? []);
    setTenants((t.data as Tenant[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantFilter, typeFilter, from, to]);

  async function saveAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!adj.tenant_id || !adj.amount) return toast.error('Tenant and amount required');
    const { error } = await supabase.from('ledger_entries').insert({
      tenant_id: adj.tenant_id,
      entry_date: adj.entry_date,
      type: 'adjustment',
      amount: adj.amount,
      notes: adj.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success('Adjustment posted');
    setOpen(false);
    setAdj({ tenant_id: '', amount: 0, notes: '', entry_date: new Date().toISOString().slice(0, 10) });
    load();
  }

  const totals = useMemo(() => {
    let charges = 0, payments = 0;
    for (const e of entries) {
      if (e.amount > 0) charges += Number(e.amount);
      else payments += Number(-e.amount);
    }
    return { charges, payments, net: charges - payments };
  }, [entries]);

  function exportCSV() {
    const rows = entries.map((e) => ({
      Date: e.entry_date,
      Tenant: e.tenant?.name ?? '',
      Type: e.type,
      Amount: e.amount,
      Balance: e.balance_after ?? '',
      Notes: e.notes ?? '',
    }));
    if (!rows.length) return toast.error('Nothing to export');
    downloadCSV(rows, `ledger-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ledger</h1>
          <p className="text-sm text-muted-foreground">
            All charges, payments, adjustments and store purchases.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4 mr-1" />
            Export
          </Button>
          {role === 'owner' && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger className={buttonVariants()}>
                <Plus className="size-4 mr-1" />
                Adjustment
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New adjustment</DialogTitle></DialogHeader>
                <form onSubmit={saveAdjustment} className="space-y-3">
                  <div className="space-y-2">
                    <Label>Tenant</Label>
                    <select
                      className="w-full border rounded-md h-9 px-2 bg-background"
                      required
                      value={adj.tenant_id}
                      onChange={(e) => setAdj((a) => ({ ...a, tenant_id: e.target.value }))}
                    >
                      <option value="">Select tenant</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (signed: + charge, − credit)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={adj.amount}
                      onChange={(e) => setAdj((a) => ({ ...a, amount: parseFloat(e.target.value || '0') }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={adj.entry_date}
                      onChange={(e) => setAdj((a) => ({ ...a, entry_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input
                      value={adj.notes}
                      onChange={(e) => setAdj((a) => ({ ...a, notes: e.target.value }))}
                    />
                  </div>
                  <DialogFooter><Button type="submit">Post</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total charges</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{formatINR(totals.charges)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total payments</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{formatINR(totals.payments)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Net outstanding</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatINR(totals.net)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Hostel expenses (in range)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">
              {formatINR(
                expenses
                  .filter((x) => x.status === 'paid'
                    && (!from || x.expense_date >= from)
                    && (!to || x.expense_date <= to))
                  .reduce((s, x) => s + Number(x.amount), 0)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle>Entries ({entries.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
            >
              <option value="all">All tenants</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>}
              {!loading && entries.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No entries.</TableCell></TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDate(e.entry_date)}</TableCell>
                  <TableCell>{e.tenant?.name ?? '-'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{e.type}</Badge></TableCell>
                  <TableCell
                    className={`text-right font-medium ${e.amount >= 0 ? 'text-amber-600' : 'text-green-600'}`}
                  >
                    {formatINR(e.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {e.balance_after !== null ? formatINR(e.balance_after) : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{e.notes ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

