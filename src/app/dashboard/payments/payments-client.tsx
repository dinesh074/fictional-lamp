'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Download, MessageCircle, FileText, CheckCircle2, Trash2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/date-range-picker';
import { downloadCSV, formatDate, formatINR, formatMonth, toISODate, waLink } from '@/lib/format';
import { tenantOnHold } from '@/lib/dues';
import { waMeUrl, renderTemplate } from '@/lib/wa';
import { upiLink } from '@/lib/upi';
import type { Payment, Tenant, Settings, Role, PaymentMode, PaymentStatus } from '@/lib/types';

type FormState = {
  tenant_id: string;
  amount: number;
  period_month: string;
  due_date: string;
  paid_date: string;
  payment_mode: PaymentMode;
  status: PaymentStatus;
  notes: string;
};

export function PaymentsClient({ role }: { role: Role }) {
  const supabase = createClient();
  const search = useSearchParams();
  const from = search.get('from') ?? toISODate(startOfMonth(new Date()));
  const to = search.get('to') ?? toISODate(endOfMonth(new Date()));

  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    tenant_id: '',
    amount: 0,
    period_month: toISODate(startOfMonth(new Date())),
    due_date: '',
    paid_date: '',
    payment_mode: 'upi',
    status: 'pending',
    notes: '',
  });

  async function load() {
    setLoading(true);
    const [p, t, s] = await Promise.all([
      supabase.from('payments')
        .select('*, tenant:tenants(*, room:rooms(*, building:buildings(*)))')
        .gte('due_date', from).lte('due_date', to)
        .order('due_date', { ascending: false }),
      supabase.from('tenants').select('*, room:rooms(*, building:buildings(*))').eq('status', 'active').order('name'),
      supabase.from('settings').select('*').eq('id', 1).single(),
    ]);
    if (p.error) toast.error(p.error.message);
    if (t.error) toast.error(t.error.message);
    setPayments((p.data as Payment[]) ?? []);
    setTenants((t.data as Tenant[]) ?? []);
    setSettings((s.data as Settings) ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  function openNew() {
    const today = new Date();
    const month = startOfMonth(today);
    const dueDay = settings?.payment_due_day ?? 5;
    const due = new Date(today.getFullYear(), today.getMonth(), dueDay);
    // Default to "paid today" — this dialog is overwhelmingly used to LOG a
    // receipt, not to schedule a future invoice. Defaulting to 'pending' was
    // turning rent-tracker cells red after an entry (regression #UX-payments).
    setForm({
      tenant_id: tenants[0]?.id ?? '',
      amount: Number(tenants[0]?.room?.monthly_rent ?? 0),
      period_month: toISODate(month),
      due_date: toISODate(due),
      paid_date: toISODate(today),
      payment_mode: 'upi',
      status: 'paid',
      notes: '',
    });
    setOpen(true);
  }

  function onTenantChange(id: string) {
    const t = tenants.find((x) => x.id === id);
    setForm((f) => ({ ...f, tenant_id: id, amount: Number(t?.room?.monthly_rent ?? f.amount) }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tenant_id) return toast.error('Choose a tenant.');
    const payload = {
      tenant_id: form.tenant_id,
      amount: form.amount,
      period_month: form.period_month,
      due_date: form.due_date,
      paid_date: form.status === 'paid' ? form.paid_date || toISODate(new Date()) : null,
      payment_mode: form.payment_mode,
      status: form.status,
      notes: form.notes || null,
    };

    // Avoid creating a duplicate row for the same tenant + period_month.
    // The rent-tracker / ledger use the first matching row, so a leftover
    // 'pending' row for the same month would visually override a freshly
    // inserted 'paid' row. If we find one, UPDATE it in place instead.
    const { data: existing, error: findErr } = await supabase
      .from('payments')
      .select('id, status')
      .eq('tenant_id', form.tenant_id)
      .eq('period_month', form.period_month)
      .neq('status', 'paid') // don't clobber an already-paid receipt
      .limit(1)
      .maybeSingle();
    if (findErr) return toast.error(findErr.message);

    const op = existing
      ? supabase.from('payments').update(payload).eq('id', existing.id)
      : supabase.from('payments').insert(payload);
    const { error } = await op;
    if (error) return toast.error(error.message);

    toast.success(existing ? 'Payment updated' : 'Payment recorded');
    setOpen(false);
    load();
  }

  async function markPaid(p: Payment) {
    const { error } = await supabase.from('payments')
      .update({ status: 'paid', paid_date: toISODate(new Date()) }).eq('id', p.id);
    if (error) return toast.error(error.message);
    toast.success('Marked as paid');
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this payment?')) return;
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Deleted');
    load();
  }

  async function generateInvoice(p: Payment) {
    if (!settings) return toast.error('Settings missing');
    const { data: existing } = await supabase.from('invoices').select('id').eq('payment_id', p.id).maybeSingle();
    let invoiceId = existing?.id as string | undefined;
    if (!invoiceId) {
      const number = `${settings.invoice_prefix}-${String(settings.invoice_counter).padStart(5, '0')}`;
      const ins = await supabase.from('invoices').insert({
        payment_id: p.id,
        invoice_number: number,
        gst_details: { gst: settings.hostel_gst, pan: settings.hostel_pan },
      }).select('id').single();
      if (ins.error) return toast.error(ins.error.message);
      invoiceId = ins.data.id;
      await supabase.from('settings').update({ invoice_counter: settings.invoice_counter + 1 }).eq('id', 1);
    }
    window.open(`/dashboard/invoices/${invoiceId}`, '_blank');
  }

  const filtered = useMemo(
    () => payments.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (tenantFilter !== 'all' && p.tenant_id !== tenantFilter) return false;
      return true;
    }),
    [payments, statusFilter, tenantFilter]
  );

  function exportCSV() {
    const rows = filtered.map((p) => ({
      Tenant: p.tenant?.name ?? '',
      Building: p.tenant?.room?.building?.name ?? '',
      Room: p.tenant?.room?.room_number ?? '',
      Period: formatMonth(p.period_month),
      'Due date': p.due_date,
      'Paid date': p.paid_date ?? '',
      Amount: p.amount,
      Mode: p.payment_mode ?? '',
      Status: p.status,
      Notes: p.notes ?? '',
    }));
    if (!rows.length) return toast.error('Nothing to export');
    downloadCSV(rows, `payments-${from}-to-${to}.csv`);
  }

  const canDelete = role === 'owner';
  const totals = useMemo(
    () => ({
      paid: filtered.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0),
      pending: filtered.filter((p) => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0),
    }),
    [filtered]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">Showing payments with due date in selected range.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DateRangePicker defaultRange={{ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }} />
          <Button variant="outline" onClick={exportCSV}><Download className="size-4 mr-1" />Export</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className={buttonVariants()} onClick={openNew}>
              <Plus className="size-4 mr-1" />Record payment
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
              <form onSubmit={save} className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label>Tenant</Label>
                  <select className="w-full border rounded-md h-9 px-2 bg-background" required
                    value={form.tenant_id} onChange={(e) => onTenantChange(e.target.value)}>
                    <option value="">Select tenant</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.room ? ` – ${t.room.building?.name}/${t.room.room_number}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (₹)</Label>
                  <Input type="number" min={0} step="0.01" required
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value || '0') }))} />
                </div>
                <div className="space-y-2">
                  <Label>Period (month)</Label>
                  <Input type="month" required value={form.period_month.slice(0, 7)}
                    onChange={(e) => setForm((f) => ({ ...f, period_month: `${e.target.value}-01` }))} />
                </div>
                <div className="space-y-2">
                  <Label>Due date</Label>
                  <Input type="date" required value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select className="w-full border rounded-md h-9 px-2 bg-background" value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PaymentStatus }))}>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
                {form.status === 'paid' && (
                  <>
                    <div className="space-y-2">
                      <Label>Paid date</Label>
                      <Input type="date" value={form.paid_date}
                        onChange={(e) => setForm((f) => ({ ...f, paid_date: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Mode</Label>
                      <select className="w-full border rounded-md h-9 px-2 bg-background" value={form.payment_mode}
                        onChange={(e) => setForm((f) => ({ ...f, payment_mode: e.target.value as PaymentMode }))}>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="card">Card</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </>
                )}
                <div className="space-y-2 col-span-2">
                  <Label>Notes</Label>
                  <Input value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <DialogFooter className="col-span-2"><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Collected</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{formatINR(totals.paid)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending + Overdue</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{formatINR(totals.pending)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Records</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{filtered.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle>Payments</CardTitle>
          <div className="flex gap-2">
            <select className="border rounded-md h-9 px-2 bg-background text-sm"
              value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
            <select className="border rounded-md h-9 px-2 bg-background text-sm"
              value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
              <option value="all">All tenants</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No payments in range.</TableCell></TableRow>
              )}
              {filtered.map((p) => {
                const onHold = tenantOnHold(p.tenant);
                const upi = settings?.upi_vpa
                  ? upiLink({
                      pa: settings.upi_vpa,
                      pn: settings.upi_payee_name ?? settings.hostel_name,
                      am: p.amount,
                      tn: `Rent ${formatMonth(p.period_month)}`,
                    })
                  : null;
                const waMsg = p.tenant?.phone && !onHold
                  ? waMeUrl(
                      p.tenant.phone,
                      renderTemplate(p.status === 'overdue' ? 'payment_overdue' : p.status === 'paid' ? 'payment_received' : 'payment_due', {
                        tenant: p.tenant,
                        settings,
                        payment: p,
                        upiLink: upi,
                      })
                    )
                  : null;
                return (
                  <TableRow key={p.id} className={onHold ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-1">
                        {p.tenant?.name}
                        {onHold && <Badge variant="secondary" className="text-[10px]">On hold</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.tenant?.room?.building?.name} / {p.tenant?.room?.room_number}
                      </div>
                    </TableCell>
                    <TableCell>{formatMonth(p.period_month)}</TableCell>
                    <TableCell>{formatDate(p.due_date)}</TableCell>
                    <TableCell className="font-medium">{formatINR(p.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'paid' ? 'default' : p.status === 'overdue' ? 'destructive' : 'secondary'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {p.status !== 'paid' && (
                        <Button size="icon" variant="ghost" title="Mark paid" onClick={() => markPaid(p)}>
                          <CheckCircle2 className="size-4 text-green-600" />
                        </Button>
                      )}
                      {waMsg && (
                        <a className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                           title="WhatsApp reminder" target="_blank" rel="noreferrer" href={waMsg}>
                          <MessageCircle className="size-4 text-green-600" />
                        </a>
                      )}
                      <Button size="icon" variant="ghost" title="Invoice" onClick={() => generateInvoice(p)}>
                        <FileText className="size-4" />
                      </Button>
                      {canDelete && (
                        <Button size="icon" variant="ghost" onClick={() => remove(p.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Tip: open the <Link className="underline" href="/dashboard/invoices">Invoices</Link> page for the full list.
      </div>
    </div>
  );
}
