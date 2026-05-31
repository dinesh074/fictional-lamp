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
import { Plus, Pencil, Trash2, Download, MessageCircle, Check, X, Minus, Send, PauseCircle, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCSV, formatDate, formatMonth, photoPublicUrl } from '@/lib/format';
import { HoldDialog } from '@/components/hold-dialog';
import { WaMessageDialog } from '@/components/wa-message-dialog';
import { OverdueWaDialog, type OverdueRow } from '@/components/overdue-wa-dialog';
import type { Tenant, Room, Role, Settings, Building } from '@/lib/types';

const TRACKER_YEAR = 2026;
const MONTHS_WINDOW: string[] = Array.from({ length: 12 }, (_, i) =>
  `${TRACKER_YEAR}-${String(i + 1).padStart(2, '0')}-01`,
);
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const DUE_SOON_DAYS = 15;

type DotStatus = 'paid' | 'missed' | 'duesoon' | 'upcoming' | 'before';
interface MonthDot {
  month: string;
  status: DotStatus;
  /** Day-difference to due-date (only meaningful for upcoming/duesoon/missed). */
  daysToDue?: number;
  dueDate?: string | null;
}

type TenantForm = Partial<Tenant>;

interface PaymentLite {
  tenant_id: string;
  period_month: string;
  status: 'paid' | 'pending' | 'overdue';
  due_date: string;
  amount: number;
}

interface PaymentSummary {
  paidTill: string | null;       // latest consecutive paid month from check-in (yyyy-MM-dd)
  hasOverdue: boolean;
  pendingCount: number;
  nextDue: string | null;        // ISO date
}

interface RoomBucket {
  roomId: string | null;
  roomNumber: string;
  capacity: number;
  occupied: number;
  tenants: Tenant[];
}
interface BuildingBucket {
  buildingId: string | null;
  buildingName: string;
  rooms: RoomBucket[];
  tenantCount: number;
}

export function TenantsClient({ role }: { role: Role }) {
  const supabase = createClient();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [payments, setPayments] = useState<PaymentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantForm>({});
  const [holdTenant, setHoldTenant] = useState<Tenant | null>(null);
  const [waTenant, setWaTenant] = useState<Tenant | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(false);

  async function load() {
    setLoading(true);
    // Twelve-month window for inline paid-till / overdue badges
    const oldest = new Date();
    oldest.setMonth(oldest.getMonth() - 11);
    oldest.setDate(1);
    const oldestISO = oldest.toISOString().slice(0, 10);

    const [t, r, b, s, p] = await Promise.all([
      supabase
        .from('tenants')
        .select('*, room:rooms(*, building:buildings(*))')
        .order('created_at', { ascending: false }),
      supabase
        .from('rooms')
        .select('*, building:buildings(*)')
        .order('room_number'),
      supabase.from('buildings').select('*').order('name'),
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase
        .from('payments')
        .select('tenant_id, period_month, status, due_date, amount')
        .gte('period_month', oldestISO),
    ]);
    if (t.error) toast.error(t.error.message);
    if (r.error) toast.error(r.error.message);
    setTenants((t.data as Tenant[]) ?? []);
    setRooms((r.data as Room[]) ?? []);
    setBuildings((b.data as Building[]) ?? []);
    setSettings((s.data as Settings) ?? null);
    setPayments((p.data as PaymentLite[]) ?? []);
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

  // Active occupants per room
  const occByRoom = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tenants) {
      if (t.status === 'active' && t.room_id) {
        m.set(t.room_id, (m.get(t.room_id) ?? 0) + 1);
      }
    }
    return m;
  }, [tenants]);

  // Group rooms under their building for the <optgroup> dropdown
  const roomsGroupedByBuilding = useMemo(() => {
    const groups = new Map<string, { buildingId: string; buildingName: string; rooms: Room[] }>();
    for (const r of rooms) {
      const bid = r.building_id ?? 'unassigned';
      const bname = r.building?.name ?? 'Unassigned';
      if (!groups.has(bid)) groups.set(bid, { buildingId: bid, buildingName: bname, rooms: [] });
      groups.get(bid)!.rooms.push(r);
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.buildingName.localeCompare(b.buildingName),
    );
  }, [rooms]);

  // Building-wise available beds, used by the 'availability' WA template
  const availability = useMemo(() => {
    let totalAvailable = 0;
    const parts: string[] = [];
    for (const b of buildings) {
      const bRooms = rooms.filter((r) => r.building_id === b.id);
      const cap = bRooms.reduce((s, r) => s + (r.capacity ?? 0), 0);
      const occ = bRooms.reduce((s, r) => s + (occByRoom.get(r.id) ?? 0), 0);
      const avail = Math.max(0, cap - occ);
      totalAvailable += avail;
      if (avail > 0) parts.push(`${b.name}: ${avail}`);
    }
    return {
      availableBeds: totalAvailable,
      buildingSummary: parts.length ? parts.join(', ') : 'all rooms full',
    };
  }, [buildings, rooms, occByRoom]);

  // Per-tenant payment summary (paid-till, overdue, next due) for inline pill
  const paymentSummaryByTenant = useMemo(() => {
    const today = new Date();
    const byTenant = new Map<string, PaymentLite[]>();
    for (const p of payments) {
      if (!byTenant.has(p.tenant_id)) byTenant.set(p.tenant_id, []);
      byTenant.get(p.tenant_id)!.push(p);
    }
    const out = new Map<string, PaymentSummary>();
    for (const [tid, list] of byTenant) {
      // Step 1 — dedupe by period_month, preferring a 'paid' row when
      // duplicates exist (otherwise a stale pending row hides a newer paid
      // receipt and the pill keeps shouting "MISSED" forever).
      const byMonth = new Map<string, PaymentLite>();
      for (const p of list) {
        const key = p.period_month.slice(0, 10);
        const prev = byMonth.get(key);
        if (!prev) byMonth.set(key, p);
        else if (prev.status !== 'paid' && p.status === 'paid') byMonth.set(key, p);
      }
      const sorted = Array.from(byMonth.values()).sort((a, b) =>
        a.period_month.localeCompare(b.period_month),
      );

      // Step 2 — implicit reconciliation: if a later month is paid, any
      // earlier non-paid rows are stale (no landlord accepts June rent while
      // May is unpaid). Treat them as paid for summary purposes.
      let lastPaidIdx = -1;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].status === 'paid') { lastPaidIdx = i; break; }
      }
      const reconciled = sorted.map((p, i) =>
        i < lastPaidIdx && p.status !== 'paid' ? { ...p, status: 'paid' as const } : p,
      );
      let paidTill: string | null = null;
      for (const p of sorted) {
        if (p.status === 'paid') paidTill = p.period_month;
        else break;
      }
      const pending = sorted.filter((p) => p.status !== 'paid');
      const next = pending[0];
      // Missed = explicit 'overdue' OR pending with due_date already past
      const isMissed =
        !!next &&
        (next.status === 'overdue' ||
          (next.due_date ? new Date(next.due_date).getTime() < today.getTime() : false));
      out.set(tid, {
        paidTill,
        hasOverdue: isMissed,
        pendingCount: pending.length,
        nextDue: next?.due_date ?? null,
      });
    }
    return out;
  }, [payments]);

  // Flat list of tenants whose oldest unpaid period is overdue (red-dot).
  // Powers the bulk "Notify overdue" WhatsApp dialog.
  const overdueItems = useMemo<OverdueRow[]>(() => {
    const now = new Date();
    // Compare at end-of-today so a due_date == today is NOT yet treated as
    // overdue (matches the rent-tracker's calendar-day semantics).
    const endOfToday = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999,
    ).getTime();
    const byTenant = new Map<string, PaymentLite[]>();
    for (const p of payments) {
      if (!byTenant.has(p.tenant_id)) byTenant.set(p.tenant_id, []);
      byTenant.get(p.tenant_id)!.push(p);
    }
    const rows: OverdueRow[] = [];
    for (const t of tenants) {
      if (t.status !== 'active') continue;
      // Dedupe by period_month, prefer paid, then ignore any non-paid row
      // that precedes a later-paid one (stale data after partial fixes).
      const oldest = list[0];
      if (!oldest) continue;
      const due = oldest.due_date ? new Date(oldest.due_date).getTime() : null;
      const isOverdue =
        oldest.status === 'overdue' || (due !== null && due < endOfToday - 86_400_000);
      if (!isOverdue) continue;
      const daysLate = due
        ? Math.max(0, Math.floor((endOfToday - due) / 86_400_000))
        : 0;
      rows.push({ tenant: t, payment: oldest, daysLate });
    }
    return rows.sort((a, b) => b.daysLate - a.daysLate);
  }, [tenants, payments]);

  // Per-tenant 12-month dot strip (same semantics as the rent tracker)
  const dotsByTenant = useMemo(() => {
    const today = new Date();
    const currentMonthIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const settingsDueDay = settings?.payment_due_day ?? 5;

    const byTenant = new Map<string, PaymentLite[]>();
    for (const p of payments) {
      if (!byTenant.has(p.tenant_id)) byTenant.set(p.tenant_id, []);
      byTenant.get(p.tenant_id)!.push(p);
    }

    const out = new Map<string, MonthDot[]>();
    for (const t of tenants) {
      const tPayments = byTenant.get(t.id) ?? [];
      const checkIn = t.check_in_date ? new Date(t.check_in_date) : null;
      const checkInMonthIso = checkIn
        ? `${checkIn.getFullYear()}-${String(checkIn.getMonth() + 1).padStart(2, '0')}-01`
        : null;
      const dueDay = t.payment_due_day ?? (checkIn ? checkIn.getDate() : settingsDueDay);

      const dots: MonthDot[] = MONTHS_WINDOW.map((monthIso) => {
        if (checkInMonthIso && monthIso < checkInMonthIso) {
          return { month: monthIso, status: 'before' };
        }
        const isFuture = monthIso > currentMonthIso;
        // Prefer paid row when duplicates exist for this month.
        const monthRows = tPayments.filter(
          (p) => p.period_month.slice(0, 10) === monthIso,
        );
        const payment =
          monthRows.find((p) => p.status === 'paid') ?? monthRows[0];

        if (payment) {
          if (payment.status === 'paid') {
            return { month: monthIso, status: 'paid', dueDate: payment.due_date };
          }
          const due = payment.due_date ? new Date(payment.due_date) : null;
          const daysToDue = due
            ? Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
            : undefined;
          const overdue =
            payment.status === 'overdue' || (daysToDue !== undefined && daysToDue < 0);
          return {
            month: monthIso,
            status: overdue
              ? 'missed'
              : daysToDue !== undefined && daysToDue <= DUE_SOON_DAYS
                ? 'duesoon'
                : 'upcoming',
            dueDate: payment.due_date,
            daysToDue,
          };
        }

        if (isFuture) {
          const [y, m] = monthIso.split('-').map(Number);
          const lastDay = new Date(y, m, 0).getDate();
          const due = new Date(y, m - 1, Math.min(dueDay, lastDay));
          const daysToDue = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
          return {
            month: monthIso,
            status: daysToDue <= DUE_SOON_DAYS ? 'duesoon' : 'upcoming',
            dueDate: due.toISOString().slice(0, 10),
            daysToDue,
          };
        }

        // Past/current month without a record → assume paid
        return { month: monthIso, status: 'paid' };
      });

      // If any later month has a REAL paid row, treat earlier missed/upcoming/
      // duesoon dots as paid too — landlords don't accept Jun rent while May
      // is unpaid, so a leftover pending row is almost certainly stale.
      let lastRealPaidIdx = -1;
      for (let i = dots.length - 1; i >= 0; i--) {
        const real = tPayments.some(
          (p) => p.period_month.slice(0, 10) === dots[i].month && p.status === 'paid',
        );
        if (real) { lastRealPaidIdx = i; break; }
      }
      if (lastRealPaidIdx > 0) {
        for (let i = 0; i < lastRealPaidIdx; i++) {
          const s = dots[i].status;
          if (s === 'missed' || s === 'upcoming' || s === 'duesoon') {
            dots[i] = { month: dots[i].month, status: 'paid' };
          }
        }
      }

      out.set(t.id, dots);
    }
    return out;
  }, [tenants, payments, settings]);

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (buildingFilter !== 'all') {
        if (buildingFilter === 'unassigned') {
          if (t.room?.building?.id) return false;
        } else if (t.room?.building?.id !== buildingFilter) {
          return false;
        }
      }
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
  }, [tenants, search, statusFilter, buildingFilter]);

  // Building → Room → tenants[] for the grouped view
  const groupedView = useMemo<BuildingBucket[]>(() => {
    const buildingMap = new Map<string, BuildingBucket>();
    const isNarrowed = statusFilter === 'inactive' || !!search;

    // Seed every visible building/room so empty rooms still appear
    if (!isNarrowed) {
      for (const r of rooms) {
        const bid = r.building_id ?? 'unassigned';
        if (buildingFilter !== 'all') {
          if (buildingFilter === 'unassigned' && bid !== 'unassigned') continue;
          if (buildingFilter !== 'unassigned' && bid !== buildingFilter) continue;
        }
        let bb = buildingMap.get(bid);
        if (!bb) {
          bb = {
            buildingId: r.building_id ?? null,
            buildingName: r.building?.name ?? 'Unassigned',
            rooms: [],
            tenantCount: 0,
          };
          buildingMap.set(bid, bb);
        }
        bb.rooms.push({
          roomId: r.id,
          roomNumber: r.room_number,
          capacity: r.capacity,
          occupied: occByRoom.get(r.id) ?? 0,
          tenants: [],
        });
      }
    }

    for (const t of filtered) {
      const bid = t.room?.building?.id ?? 'unassigned';
      const bname = t.room?.building?.name ?? 'Unassigned';
      let bb = buildingMap.get(bid);
      if (!bb) {
        bb = {
          buildingId: t.room?.building?.id ?? null,
          buildingName: bname,
          rooms: [],
          tenantCount: 0,
        };
        buildingMap.set(bid, bb);
      }
      bb.tenantCount += 1;
      const rid = t.room?.id ?? null;
      let rb = bb.rooms.find((r) => r.roomId === rid);
      if (!rb) {
        rb = {
          roomId: rid,
          roomNumber: t.room?.room_number ?? '—',
          capacity: t.room?.capacity ?? 0,
          occupied: rid ? occByRoom.get(rid) ?? 0 : 0,
          tenants: [],
        };
        bb.rooms.push(rb);
      }
      rb.tenants.push(t);
    }

    return Array.from(buildingMap.values())
      .map((bb) => ({
        ...bb,
        rooms: bb.rooms.sort((a, b) => {
          if (a.roomId === null) return 1;
          if (b.roomId === null) return -1;
          return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
        }),
      }))
      .sort((a, b) => {
        if (a.buildingId === null) return 1;
        if (b.buildingId === null) return -1;
        return a.buildingName.localeCompare(b.buildingName);
      });
  }, [filtered, rooms, occByRoom, buildingFilter, statusFilter, search]);

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
          <Button
            variant="outline"
            onClick={() => setOverdueOpen(true)}
            disabled={overdueItems.length === 0}
            className={
              overdueItems.length > 0
                ? 'border-red-600/40 text-red-700 hover:bg-red-50 hover:text-red-800'
                : ''
            }
            title={
              overdueItems.length === 0
                ? 'No overdue tenants'
                : `Open WhatsApp reminders for ${overdueItems.length} overdue tenant(s)`
            }
          >
            <Send className="size-4 mr-1" />
            Notify overdue
            {overdueItems.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-1.5 h-5 px-1.5 text-[10px] animate-pulse"
              >
                {overdueItems.length}
              </Badge>
            )}
          </Button>
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
                    {roomsGroupedByBuilding.map(({ buildingId, buildingName, rooms: bRooms }) => (
                      <optgroup key={buildingId} label={buildingName}>
                        {bRooms.map((r) => {
                          const occ = occByRoom.get(r.id) ?? 0;
                          const occForThis =
                            editing && editing.room_id === r.id ? occ - 1 : occ;
                          const isFull = occForThis >= r.capacity;
                          const isCurrent = editing?.room_id === r.id;
                          if (isFull && !isCurrent) return null;
                          return (
                            <option key={r.id} value={r.id}>
                              {r.room_number} ({occForThis}/{r.capacity})
                              {isCurrent ? ' • current' : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Fully-occupied rooms are hidden. Numbers show current / capacity.
                  </p>
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
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
              title="Filter by building"
            >
              <option value="all">All buildings</option>
              <option value="unassigned">Unassigned</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <div className="inline-flex rounded-md border h-9 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setViewMode('grouped')}
                className={`px-3 ${viewMode === 'grouped' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                title="Group by building & room"
              >
                Grouped
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 border-l ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                title="Flat list"
              >
                List
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!loading && filtered.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mb-3 pb-2 border-b">
              <span className="font-semibold uppercase tracking-wide text-[10px]">
                {TRACKER_YEAR} rent:
              </span>
              <LegendChip status="paid"     label="Paid" />
              <LegendChip status="duesoon"  label="Due soon" />
              <LegendChip status="missed"   label="Missed" />
              <LegendChip status="upcoming" label="Upcoming" />
              <LegendChip status="before"   label="Before join" />
            </div>
          )}
          {viewMode === 'grouped' ? (
            <GroupedTenants
              groups={groupedView}
              loading={loading}
              canDelete={canDelete}
              onEdit={openEdit}
              onRemove={remove}
              onWa={setWaTenant}
              onHold={setHoldTenant}
              paymentSummary={paymentSummaryByTenant}
              dotsByTenant={dotsByTenant}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Building / Room</TableHead>
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="hidden lg:table-cell">Check-in</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7}>Loading…</TableCell>
                  </TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
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
                      <div className="flex flex-col gap-1.5">
                        <MonthDotsStrip dots={dotsByTenant.get(t.id) ?? []} />
                        <RentStatusPill
                          summary={paymentSummaryByTenant.get(t.id)}
                          checkInDate={t.check_in_date}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>
                        {t.status}
                      </Badge>
                      {t.payment_hold && (
                        <Badge
                          className="ml-1 text-[10px] bg-amber-600 text-white"
                          title={
                            t.payment_hold_until
                              ? `On hold until ${t.payment_hold_until}${t.payment_hold_reason ? ` — ${t.payment_hold_reason}` : ''}`
                              : `On hold${t.payment_hold_reason ? ` — ${t.payment_hold_reason}` : ''}`
                          }
                        >
                          on hold
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {t.phone && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Send WhatsApp message"
                          onClick={() => setWaTenant(t)}
                        >
                          <MessageCircle className="size-4 text-green-600" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title={
                          t.payment_hold
                            ? `Payment on hold${t.payment_hold_until ? ` until ${t.payment_hold_until}` : ''} — click to update / clear`
                            : "Pause / hold this tenant's payments"
                        }
                        onClick={() => setHoldTenant(t)}
                      >
                        {t.payment_hold ? (
                          <PlayCircle className="size-4 text-amber-600" />
                        ) : (
                          <PauseCircle className="size-4" />
                        )}
                      </Button>
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
          )}
        </CardContent>
      </Card>

      <HoldDialog
        tenant={holdTenant}
        open={holdTenant !== null}
        onOpenChange={(v) => { if (!v) setHoldTenant(null); }}
        onSaved={load}
      />

      {waTenant && (
        <WaMessageDialog
          open={waTenant !== null}
          onOpenChange={(v) => { if (!v) setWaTenant(null); }}
          tenant={waTenant}
          settings={settings}
          availability={availability}
        />
      )}

      <OverdueWaDialog
        open={overdueOpen}
        onOpenChange={setOverdueOpen}
        items={overdueItems}
        settings={settings}
      />
    </div>
  );
}

// =====================================================================
// Grouped view: Building → Room → Tenants
// =====================================================================

function GroupedTenants({
  groups, loading, canDelete, onEdit, onRemove, onWa, onHold, paymentSummary, dotsByTenant,
}: {
  groups: BuildingBucket[];
  loading: boolean;
  canDelete: boolean;
  onEdit: (t: Tenant) => void;
  onRemove: (id: string) => void;
  onWa: (t: Tenant) => void;
  onHold: (t: Tenant) => void;
  paymentSummary: Map<string, PaymentSummary>;
  dotsByTenant: Map<string, MonthDot[]>;
}) {
  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No tenants match the filters.</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((bb) => (
        <div key={bb.buildingId ?? 'unassigned'} className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <h3 className="font-semibold text-base">{bb.buildingName}</h3>
            <Badge variant="secondary" className="text-[10px]">
              {bb.tenantCount} tenant{bb.tenantCount === 1 ? '' : 's'}
            </Badge>
          </div>
          {bb.rooms.length === 0 ? (
            <p className="text-xs text-muted-foreground italic pl-2">No rooms.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {bb.rooms.map((r) => {
                const isFull = r.capacity > 0 && r.occupied >= r.capacity;
                const isEmpty = r.occupied === 0;
                return (
                  <div key={r.roomId ?? 'none'} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">
                        Room {r.roomNumber}
                        {r.roomId === null && (
                          <span className="text-muted-foreground"> (unassigned)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {r.roomId && (
                          <span className="text-xs text-muted-foreground">
                            {r.occupied}/{r.capacity}
                          </span>
                        )}
                        {r.roomId && (isFull
                          ? <Badge variant="destructive" className="text-[10px]">Full</Badge>
                          : isEmpty
                            ? <Badge variant="secondary" className="text-[10px]">Empty</Badge>
                            : <Badge className="text-[10px]">{r.capacity - r.occupied} free</Badge>)}
                      </div>
                    </div>
                    {r.tenants.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No tenants in this room.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {r.tenants.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between gap-2 rounded-md hover:bg-muted/40 px-2 py-1"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {t.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={photoPublicUrl(t.photo_url) ?? ''}
                                  alt=""
                                  className="size-7 rounded-full object-cover border shrink-0"
                                />
                              ) : (
                                <div className="size-7 rounded-full bg-muted border shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm truncate">
                                  {t.name}
                                  {t.status !== 'active' && (
                                    <Badge variant="secondary" className="ml-1 text-[9px]">
                                      {t.status}
                                    </Badge>
                                  )}
                                  {t.payment_hold && (
                                    <Badge
                                      className="ml-1 text-[9px] bg-amber-600 text-white"
                                      title={
                                        t.payment_hold_until
                                          ? `On hold until ${t.payment_hold_until}${t.payment_hold_reason ? ` — ${t.payment_hold_reason}` : ''}`
                                          : `On hold${t.payment_hold_reason ? ` — ${t.payment_hold_reason}` : ''}`
                                      }
                                    >
                                      on hold
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {t.phone && (
                                    <span className="text-[11px] text-muted-foreground truncate">
                                      {t.phone}
                                    </span>
                                  )}
                                  <RentStatusPill
                                    summary={paymentSummary.get(t.id)}
                                    checkInDate={t.check_in_date}
                                  />
                                </div>
                                <div className="mt-1">
                                  <MonthDotsStrip dots={dotsByTenant.get(t.id) ?? []} />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center shrink-0">
                              {t.phone && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7"
                                  title="WhatsApp"
                                  onClick={() => onWa(t)}
                                >
                                  <MessageCircle className="size-3.5 text-green-600" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                title={
                                  t.payment_hold
                                    ? `Payment on hold${t.payment_hold_until ? ` until ${t.payment_hold_until}` : ''} — click to update / clear`
                                    : "Pause / hold this tenant's payments"
                                }
                                onClick={() => onHold(t)}
                              >
                                {t.payment_hold ? (
                                  <PlayCircle className="size-3.5 text-amber-600" />
                                ) : (
                                  <PauseCircle className="size-3.5" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => onEdit(t)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              {canDelete && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7"
                                  onClick={() => onRemove(t.id)}
                                >
                                  <Trash2 className="size-3.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RentStatusPill({
  summary, checkInDate,
}: { summary?: PaymentSummary; checkInDate?: string | null }) {
  const now = new Date();
  const assumedPaidTill =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  // Next-due date derived from the tenant's check-in day-of-month.
  // If the day-of-month has already passed in the current month, roll forward.
  function nextDueFromCheckIn(): { iso: string; days: number } | null {
    if (!checkInDate) return null;
    const ci = new Date(checkInDate);
    if (isNaN(ci.getTime())) return null;
    const day = ci.getDate();
    let y = now.getFullYear();
    let m = now.getMonth();
    const lastDayCur = new Date(y, m + 1, 0).getDate();
    let candidate = new Date(y, m, Math.min(day, lastDayCur));
    if (candidate.getTime() < now.getTime() - 1000 * 60 * 60 * 12) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      const lastDayNext = new Date(y, m + 1, 0).getDate();
      candidate = new Date(y, m, Math.min(day, lastDayNext));
    }
    return {
      iso: candidate.toISOString().slice(0, 10),
      days: Math.ceil((candidate.getTime() - now.getTime()) / 86_400_000),
    };
  }

  // ---- Real overdue row → red MISSED pill ----------------------------------
  if (summary?.hasOverdue) {
    return (
      <PillBadge
        status="missed"
        title={`Next due: ${summary.nextDue ?? '—'}`}
        text={`MISSED · paid till ${summary.paidTill ? formatMonth(summary.paidTill) : '—'}`}
      />
    );
  }

  // ---- Real pending row → amber if due ≤15d else sky upcoming --------------
  if (summary && summary.pendingCount > 0) {
    const dueIso = summary.nextDue;
    const days = dueIso
      ? Math.ceil((new Date(dueIso).getTime() - now.getTime()) / 86_400_000)
      : null;
    const dateLbl = dueIso
      ? new Date(dueIso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '—';
    if (days !== null && days <= 15) {
      return (
        <PillBadge
          status="duesoon"
          title={`Next due: ${dueIso} (in ${days}d)`}
          text={`Paid till ${formatMonth(summary.paidTill ?? assumedPaidTill)} · due ${dateLbl} (in ${days}d)`}
        />
      );
    }
    return (
      <PillBadge
        status="upcoming"
        title={`Next due: ${dueIso}`}
        text={`Paid till ${formatMonth(summary.paidTill ?? assumedPaidTill)} · next due ${dateLbl}`}
      />
    );
  }

  // ---- No pending row: assumed paid till current month, derive next due ----
  const paidTill = summary?.paidTill ?? assumedPaidTill;
  const nd = nextDueFromCheckIn();
  if (!nd) {
    return (
      <PillBadge
        status="paid"
        title={`Paid till ${formatMonth(paidTill)}`}
        text={`Paid till ${formatMonth(paidTill)}`}
      />
    );
  }
  const dateLbl = new Date(nd.iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  });
  if (nd.days <= 15) {
    return (
      <PillBadge
        status="duesoon"
        title={`Joined ${checkInDate}. Next due ${nd.iso} (in ${nd.days}d).`}
        text={`Paid till ${formatMonth(paidTill)} · due ${dateLbl} (in ${nd.days}d)`}
      />
    );
  }
  return (
    <PillBadge
      status="upcoming"
      title={`Joined ${checkInDate}. Next due ${nd.iso}.`}
      text={`Paid till ${formatMonth(paidTill)} · next due ${dateLbl}`}
    />
  );
}

/** Coloured pill with a circular tick/cross/dash matching the DotsStrip palette. */
function PillBadge({
  status, text, title,
}: { status: DotStatus; text: string; title?: string }) {
  const s = DOT_STYLES[status];
  const icon =
    status === 'paid' ? (
      <Check size={9} strokeWidth={4} />
    ) : status === 'missed' ? (
      <X size={9} strokeWidth={4} />
    ) : (
      <Minus size={9} strokeWidth={4} />
    );
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
        status === 'missed' ? 'animate-pulse' : ''
      }`}
      style={{
        backgroundColor: s.bg,
        color: s.fg,
        boxShadow: `inset 0 0 0 1px ${s.ring}`,
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 12,
          height: 12,
          backgroundColor: '#ffffff',
          color: s.bg,
        }}
      >
        {icon}
      </span>
      {text}
    </span>
  );
}

/**
 * Compact 12-month rent calendar shown inline on the tenants screen.
 * Uses inline styles for the colors so it renders identically regardless of
 * Tailwind JIT/purge behaviour. Each cell = month letter on top, a filled
 * coloured circle with a check / cross / dash icon below.
 */
const DOT_STYLES: Record<
  DotStatus,
  { bg: string; ring: string; fg: string; label: string }
> = {
  paid:     { bg: '#047857', ring: '#064e3b', fg: '#ffffff', label: 'Paid'      }, // emerald-700/900
  missed:   { bg: '#b91c1c', ring: '#7f1d1d', fg: '#ffffff', label: 'Missed'    }, // red-700/900
  duesoon:  { bg: '#f59e0b', ring: '#92400e', fg: '#ffffff', label: 'Due soon'  }, // amber-500/800
  upcoming: { bg: '#0ea5e9', ring: '#075985', fg: '#ffffff', label: 'Upcoming'  }, // sky-500/800
  before:   { bg: '#e2e8f0', ring: '#94a3b8', fg: '#64748b', label: 'Before join' }, // slate
};

function MonthDotsStrip({ dots }: { dots: MonthDot[] }) {
  if (dots.length === 0) return null;
  return (
    <div className="inline-flex items-end gap-1">
      {dots.map((d, i) => {
        const monthLabel = `${MONTH_LETTERS[i]} ${TRACKER_YEAR}`;
        const s = DOT_STYLES[d.status];

        let title = `${monthLabel}: ${s.label}`;
        if (d.status === 'missed') title = `${monthLabel}: missed (due ${d.dueDate ?? '—'})`;
        else if (d.status === 'duesoon')
          title = `${monthLabel}: due ${d.dueDate ?? '—'}${
            d.daysToDue !== undefined ? ` (in ${d.daysToDue}d)` : ''
          }`;
        else if (d.status === 'upcoming')
          title = `${monthLabel}: upcoming${d.dueDate ? ` (due ${d.dueDate})` : ''}`;

        const iconNode =
          d.status === 'paid' ? (
            <Check size={12} strokeWidth={4} />
          ) : d.status === 'missed' ? (
            <X size={12} strokeWidth={4} />
          ) : (
            <Minus size={12} strokeWidth={4} />
          );

        return (
          <div key={d.month} className="flex flex-col items-center" title={title}>
            <span className="text-[10px] leading-none text-muted-foreground font-semibold">
              {MONTH_LETTERS[i]}
            </span>
            <span
              className={`mt-1 inline-flex items-center justify-center rounded-full ${
                d.status === 'missed' ? 'animate-pulse' : ''
              }`}
              style={{
                width: 20,
                height: 20,
                backgroundColor: s.bg,
                boxShadow: `0 0 0 2px ${s.ring}`,
                color: s.fg,
              }}
            >
              {iconNode}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LegendChip({
  status, label,
}: { status: DotStatus; label: string }) {
  const s = DOT_STYLES[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 14,
          height: 14,
          backgroundColor: s.bg,
          boxShadow: `0 0 0 2px ${s.ring}`,
          color: s.fg,
        }}
      >
        {status === 'paid' ? (
          <Check size={9} strokeWidth={4} />
        ) : status === 'missed' ? (
          <X size={9} strokeWidth={4} />
        ) : (
          <Minus size={9} strokeWidth={4} />
        )}
      </span>
      <span>{label}</span>
    </span>
  );
}
