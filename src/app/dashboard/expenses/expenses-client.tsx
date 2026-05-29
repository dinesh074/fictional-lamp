'use client';

import { useEffect, useMemo, useState } from 'react';
import { startOfMonth, endOfMonth, addMonths, addWeeks, addDays } from 'date-fns';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Download, CheckCircle2, Repeat, AlertCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ImageUpload } from '@/components/image-upload';
import { downloadCSV, formatDate, formatINR, formatMonth, toISODate, photoPublicUrl } from '@/lib/format';
import type {
  Building, Expense, ExpenseCategory, ExpensePaymentMethod, ExpenseStatus,
  Profile, RecurringPeriod, Role,
} from '@/lib/types';

const CATEGORIES: { value: ExpenseCategory; label: string; subs?: string[] }[] = [
  { value: 'purchase', label: 'Hostel purchase', subs: ['Groceries', 'Toiletries', 'Stationery', 'Linens', 'Kitchen', 'Other'] },
  { value: 'utility_bill', label: 'Utility bill', subs: ['Electricity', 'Water', 'Gas', 'Internet', 'Cable', 'Other'] },
  { value: 'salary', label: 'Salary' },
  { value: 'rent', label: 'Building rent paid' },
  { value: 'maintenance', label: 'Maintenance / repair', subs: ['Plumbing', 'Electrical', 'Cleaning', 'Pest control', 'Carpentry', 'Other'] },
  { value: 'tax', label: 'Tax / GST' },
  { value: 'other', label: 'Other' },
];

type Form = Partial<Expense>;

function addPeriod(d: Date, p: RecurringPeriod): Date {
  switch (p) {
    case 'weekly': return addWeeks(d, 1);
    case 'monthly': return addMonths(d, 1);
    case 'quarterly': return addMonths(d, 3);
    case 'yearly': return addMonths(d, 12);
  }
}

export function ExpensesClient({ role }: { role: Role }) {
  const supabase = createClient();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [month, setMonth] = useState<string>(toISODate(startOfMonth(new Date())).slice(0, 7));
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<Form>({
    category: 'purchase',
    status: 'paid',
    expense_date: toISODate(new Date()),
    payment_method: 'cash',
    recurring: false,
  });

  async function load() {
    setLoading(true);
    const periodStart = `${month}-01`;
    const periodEnd = toISODate(endOfMonth(new Date(periodStart)));
    const [eRes, bRes, sRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('*, building:buildings(*), staff:profiles!expenses_staff_id_fkey(*)')
        .gte('expense_date', periodStart)
        .lte('expense_date', periodEnd)
        .order('expense_date', { ascending: false }),
      supabase.from('buildings').select('*').order('name'),
      supabase.from('profiles').select('*').order('name'),
    ]);
    if (eRes.error) toast.error(eRes.error.message);
    setExpenses((eRes.data as Expense[]) ?? []);
    setBuildings((bRes.data as Building[]) ?? []);
    setStaff((sRes.data as Profile[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function openNew() {
    setEditing(null);
    setForm({
      category: 'purchase',
      status: 'paid',
      expense_date: toISODate(new Date()),
      paid_date: toISODate(new Date()),
      payment_method: 'cash',
      recurring: false,
      amount: 0,
    });
    setOpen(true);
  }
  function openEdit(x: Expense) { setEditing(x); setForm(x); setOpen(true); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) return toast.error('Amount required');
    if (!form.category) return toast.error('Category required');

    const payload = {
      expense_date: form.expense_date || toISODate(new Date()),
      category: form.category,
      subcategory: form.subcategory || null,
      vendor_name: form.vendor_name || null,
      staff_id: form.category === 'salary' ? (form.staff_id || null) : null,
      building_id: form.building_id || null,
      amount: Number(form.amount),
      payment_method: form.payment_method || null,
      status: form.status || 'paid',
      paid_date: form.status === 'paid' ? (form.paid_date || toISODate(new Date())) : null,
      description: form.description || null,
      receipt_url: form.receipt_url ?? null,
      recurring: !!form.recurring,
      recurring_period: form.recurring ? (form.recurring_period || 'monthly') : null,
      next_due_date: form.recurring
        ? toISODate(addPeriod(new Date(form.expense_date || new Date()), form.recurring_period || 'monthly'))
        : null,
    };

    const q = editing
      ? supabase.from('expenses').update(payload).eq('id', editing.id)
      : supabase.from('expenses').insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success(editing ? 'Updated' : 'Added');
    setOpen(false);
    load();
  }

  async function markPaid(x: Expense) {
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'paid', paid_date: toISODate(new Date()) })
      .eq('id', x.id);
    if (error) return toast.error(error.message);
    toast.success('Marked paid');
    load();
  }

  async function postNextRecurring(x: Expense) {
    if (!x.recurring || !x.recurring_period) return;
    const base = new Date(x.next_due_date || x.expense_date);
    const payload = {
      expense_date: toISODate(base),
      category: x.category,
      subcategory: x.subcategory,
      vendor_name: x.vendor_name,
      staff_id: x.staff_id,
      building_id: x.building_id,
      amount: Number(x.amount),
      payment_method: x.payment_method,
      status: 'pending' as ExpenseStatus,
      description: x.description,
      recurring: true,
      recurring_period: x.recurring_period,
      next_due_date: toISODate(addPeriod(base, x.recurring_period)),
      parent_expense_id: x.id,
    };
    const ins = await supabase.from('expenses').insert(payload);
    if (ins.error) return toast.error(ins.error.message);
    // bump the parent's next_due_date so we don't re-post the same one
    await supabase
      .from('expenses')
      .update({ next_due_date: toISODate(addPeriod(base, x.recurring_period)) })
      .eq('id', x.id);
    toast.success('Next instalment posted');
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this expense?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) return toast.error(error.message);
    load();
  }

  const filtered = useMemo(() => expenses.filter((x) => {
    if (categoryFilter !== 'all' && x.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && x.status !== statusFilter) return false;
    if (buildingFilter !== 'all' && x.building_id !== buildingFilter) return false;
    return true;
  }), [expenses, categoryFilter, statusFilter, buildingFilter]);

  const totals = useMemo(() => {
    const t = { paid: 0, pending: 0, byCategory: new Map<ExpenseCategory, number>() };
    for (const x of filtered) {
      if (x.status === 'paid') t.paid += Number(x.amount);
      else t.pending += Number(x.amount);
      t.byCategory.set(x.category, (t.byCategory.get(x.category) ?? 0) + Number(x.amount));
    }
    return t;
  }, [filtered]);

  const recurringDueSoon = useMemo(() => {
    const horizon = addDays(new Date(), 7);
    return expenses.filter((x) =>
      x.recurring && x.next_due_date && new Date(x.next_due_date) <= horizon
    );
  }, [expenses]);

  function exportCSV() {
    const rows = filtered.map((x) => ({
      Date: x.expense_date,
      Category: x.category,
      Subcategory: x.subcategory ?? '',
      Vendor: x.vendor_name ?? '',
      Staff: x.staff?.name ?? '',
      Building: x.building?.name ?? '',
      Amount: x.amount,
      Method: x.payment_method ?? '',
      Status: x.status,
      'Paid date': x.paid_date ?? '',
      Recurring: x.recurring ? `${x.recurring_period}` : '',
      'Next due': x.next_due_date ?? '',
      Description: x.description ?? '',
    }));
    if (!rows.length) return toast.error('Nothing to export');
    downloadCSV(rows, `expenses-${month}.csv`);
  }

  const cat = CATEGORIES.find((c) => c.value === form.category);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Hostel-side spending: purchases, bills, salaries — {formatMonth(`${month}-01`)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-auto"
          />
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4 mr-1" />Export
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className={buttonVariants()} onClick={openNew}>
              <Plus className="size-4 mr-1" />Expense
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit' : 'New'} expense</DialogTitle>
              </DialogHeader>
              <form onSubmit={save} className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    required
                    value={form.category ?? 'purchase'}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory, subcategory: '' }))
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Subcategory</Label>
                  {cat?.subs ? (
                    <select
                      className="w-full border rounded-md h-9 px-2 bg-background"
                      value={form.subcategory ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
                    >
                      <option value="">—</option>
                      {cat.subs.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <Input
                      value={form.subcategory ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Amount (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={form.amount ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value || '0') }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    required
                    value={form.expense_date ?? toISODate(new Date())}
                    onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                  />
                </div>

                {form.category === 'salary' ? (
                  <div className="space-y-2">
                    <Label>Staff member</Label>
                    <select
                      className="w-full border rounded-md h-9 px-2 bg-background"
                      value={form.staff_id ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value || null }))}
                    >
                      <option value="">—</option>
                      {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Vendor / payee</Label>
                    <Input
                      value={form.vendor_name ?? ''}
                      list="vendor-list"
                      onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
                      placeholder="e.g. BESCOM, Reliance Jio, Ramesh Plumbing"
                    />
                    <datalist id="vendor-list">
                      {[...new Set(expenses.map((x) => x.vendor_name).filter(Boolean))].map((v) => (
                        <option key={v as string} value={v as string} />
                      ))}
                    </datalist>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Building (optional)</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    value={form.building_id ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, building_id: e.target.value || null }))}
                  >
                    <option value="">Hostel-wide</option>
                    {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    value={form.status ?? 'paid'}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ExpenseStatus }))}
                  >
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    value={form.payment_method ?? 'cash'}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, payment_method: e.target.value as ExpensePaymentMethod }))
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {form.status === 'paid' && (
                  <div className="space-y-2">
                    <Label>Paid date</Label>
                    <Input
                      type="date"
                      value={form.paid_date ?? toISODate(new Date())}
                      onChange={(e) => setForm((f) => ({ ...f, paid_date: e.target.value }))}
                    />
                  </div>
                )}

                <div className="space-y-2 col-span-2 border rounded-md p-3 bg-muted/30">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={!!form.recurring}
                      onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))}
                    />
                    Recurring bill (auto-remind to post next instalment)
                  </label>
                  {form.recurring && (
                    <select
                      className="w-full border rounded-md h-9 px-2 bg-background mt-2"
                      value={form.recurring_period ?? 'monthly'}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, recurring_period: e.target.value as RecurringPeriod }))
                      }
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Description / notes</Label>
                  <Textarea
                    rows={2}
                    value={form.description ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <ImageUpload
                    bucket="expense-receipts"
                    pathPrefix="receipts"
                    value={form.receipt_url}
                    onChange={(url) => setForm((f) => ({ ...f, receipt_url: url }))}
                    label="Receipt / bill photo (≤150 KB)"
                  />
                </div>

                <DialogFooter className="col-span-2"><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Paid this month</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatINR(totals.paid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending / scheduled</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatINR(totals.pending)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Entries</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{filtered.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Repeat className="size-4" />Recurring due ≤ 7d
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recurringDueSoon.length}</div>
          </CardContent>
        </Card>
      </div>

      {recurringDueSoon.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600" />
              Recurring bills coming due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {recurringDueSoon.map((x) => (
                <div key={x.id} className="flex items-center justify-between text-sm border-b py-1 last:border-0">
                  <div>
                    <span className="font-medium">{x.vendor_name || x.subcategory || x.category}</span>
                    <span className="text-muted-foreground"> · {formatINR(x.amount)} · next {formatDate(x.next_due_date)}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => postNextRecurring(x)}>
                    Post next
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle>All expenses</CardTitle>
          <div className="flex flex-wrap gap-2">
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
            </select>
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
            >
              <option value="all">All buildings</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Vendor / staff</TableHead>
                <TableHead>Building</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={8}>Loading…</TableCell></TableRow>}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground">No expenses.</TableCell></TableRow>
              )}
              {filtered.map((x) => (
                <TableRow key={x.id}>
                  <TableCell>{formatDate(x.expense_date)}</TableCell>
                  <TableCell>
                    <div className="font-medium capitalize">{x.category.replace('_', ' ')}</div>
                    {x.subcategory && <div className="text-xs text-muted-foreground">{x.subcategory}</div>}
                    {x.recurring && <Badge variant="outline" className="text-[10px] mt-1"><Repeat className="size-3 mr-0.5" />{x.recurring_period}</Badge>}
                  </TableCell>
                  <TableCell>{x.staff?.name || x.vendor_name || '-'}</TableCell>
                  <TableCell>{x.building?.name || <span className="text-muted-foreground">Hostel-wide</span>}</TableCell>
                  <TableCell className="text-right font-medium">{formatINR(x.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={x.status === 'paid' ? 'default' : x.status === 'pending' ? 'destructive' : 'secondary'}>
                      {x.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {x.receipt_url ? (
                      <a href={photoPublicUrl(x.receipt_url, 'expense-receipts') ?? '#'} target="_blank" rel="noreferrer"
                         className="text-xs underline">View</a>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {x.status !== 'paid' && (
                      <Button size="icon" variant="ghost" title="Mark paid" onClick={() => markPaid(x)}>
                        <CheckCircle2 className="size-4 text-green-600" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => openEdit(x)}><Pencil className="size-4" /></Button>
                    {role === 'owner' && (
                      <Button size="icon" variant="ghost" onClick={() => remove(x.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
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

