'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Download, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCSV, formatDate, waLink, photoPublicUrl } from '@/lib/format';
import { HoldDialog } from '@/components/hold-dialog';
import type { Tenant, Room, Role } from '@/lib/types';

type TenantForm = Partial<Tenant>;

export function TenantsClient({ role }: { role: Role }) {
  const supabase = createClient();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantForm>({});
  const [holdTenant, setHoldTenant] = useState<Tenant | null>(null);

  async function load() {
    setLoading(true);
    const [t, r] = await Promise.all([
      supabase
        .from('tenants')
        .select('*, room:rooms(*, building:buildings(*))')
        .order('created_at', { ascending: false }),
      supabase
        .from('rooms')
        .select('*, building:buildings(*)')
        .order('room_number'),
    ]);
    if (t.error) toast.error(t.error.message);
    if (r.error) toast.error(r.error.message);
    setTenants((t.data as Tenant[]) ?? []);
    setRooms((r.data as Room[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditing(null);
    setForm({ status: 'active' });
    setOpen(true);
  }
  function openEdit(t: Tenant) {
    setEditing(t);
    setForm(t);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      room_id: form.room_id || null,
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      aadhar: form.aadhar || null,
      pan: form.pan || null,
      gst_number: form.gst_number || null,
      emergency_contact: form.emergency_contact || null,
      check_in_date: form.check_in_date || null,
      check_out_date: form.check_out_date || null,
      status: form.status || 'active',
    };
    const q = editing
      ? supabase.from('tenants').update(payload).eq('id', editing.id)
      : supabase.from('tenants').insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success(editing ? 'Tenant updated' : 'Tenant added');
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this tenant and all their payments?')) return;
    const { error } = await supabase.from('tenants').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Tenant deleted');
    load();
  }

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          (t.phone ?? '').includes(q) ||
          (t.email ?? '').toLowerCase().includes(q) ||
          (t.room?.room_number ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tenants, search, statusFilter]);

  function exportCSV() {
    const rows = filtered.map((t) => ({
      Name: t.name,
      Phone: t.phone ?? '',
      Email: t.email ?? '',
      Building: t.room?.building?.name ?? '',
      Room: t.room?.room_number ?? '',
      Aadhar: t.aadhar ?? '',
      PAN: t.pan ?? '',
      GST: t.gst_number ?? '',
      'Check in': t.check_in_date ?? '',
      'Check out': t.check_out_date ?? '',
      Status: t.status,
    }));
    if (rows.length === 0) return toast.error('Nothing to export');
    downloadCSV(rows, `tenants-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const canDelete = role === 'owner';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            All people currently or previously staying.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4 mr-1" />
            Export CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className={buttonVariants()} onClick={openNew}>
              <Plus className="size-4 mr-1" />
              New tenant
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit' : 'New'} tenant</DialogTitle>
              </DialogHeader>
              <form onSubmit={save} className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label>Name *</Label>
                  <Input
                    required
                    value={form.name ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Room</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    value={form.room_id ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, room_id: e.target.value || null }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.building?.name} – {r.room_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Aadhar</Label>
                  <Input
                    value={form.aadhar ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, aadhar: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PAN</Label>
                  <Input
                    value={form.pan ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>GST number</Label>
                  <Input
                    value={form.gst_number ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, gst_number: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Emergency contact</Label>
                  <Input
                    value={form.emergency_contact ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, emergency_contact: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Check-in date</Label>
                  <Input
                    type="date"
                    value={form.check_in_date ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, check_in_date: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Check-out date</Label>
                  <Input
                    type="date"
                    value={form.check_out_date ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, check_out_date: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Payment due day (1–28)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    placeholder="Leave blank to use default from Settings"
                    value={form.payment_due_day ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        payment_due_day:
                          e.target.value === ''
                            ? null
                            : (Number(e.target.value) as Tenant['payment_due_day']),
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Each tenant can have their own rent due day; leave blank to use the
                    hostel-wide default.
                  </p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Status</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    value={form.status ?? 'active'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value as Tenant['status'],
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="submit">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle>All tenants ({filtered.length})</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Search name, phone, email, room…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Building / Room</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Check-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6}>Loading…</TableCell>
                </TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No tenants.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {t.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoPublicUrl(t.photo_url) ?? ''}
                          alt=""
                          className="size-8 rounded-full object-cover border shrink-0"
                        />
                      ) : (
                        <div className="size-8 rounded-full bg-muted border shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate">{t.name}</div>
                        <div className="md:hidden text-xs text-muted-foreground truncate">
                          {t.room
                            ? `${t.room.building?.name} / ${t.room.room_number}`
                            : 'Unassigned'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t.room ? (
                      `${t.room.building?.name} / ${t.room.room_number}`
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{t.phone || '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatDate(t.check_in_date)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {t.phone && (
                      <a
                        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                        title="WhatsApp"
                        href={waLink(t.phone, `Hi ${t.name}, this is a message from your PG.`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle className="size-4 text-green-600" />
                      </a>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                      <Pencil className="size-4" />
                    </Button>
                    {canDelete && (
                      <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
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

      <HoldDialog
        tenant={holdTenant}
        open={holdTenant !== null}
        onOpenChange={(v) => { if (!v) setHoldTenant(null); }}
        onSaved={load}
      />
    </div>
  );
}
