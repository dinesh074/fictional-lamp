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
import { downloadCSV, formatDate, photoPublicUrl } from '@/lib/format';
import { HoldDialog } from '@/components/hold-dialog';
import { WaMessageDialog } from '@/components/wa-message-dialog';
import type { Tenant, Room, Role, Settings, Building } from '@/lib/types';

type TenantForm = Partial<Tenant>;

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

  async function load() {
    setLoading(true);
    const [t, r, b, s] = await Promise.all([
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
    ]);
    if (t.error) toast.error(t.error.message);
    if (r.error) toast.error(r.error.message);
    setTenants((t.data as Tenant[]) ?? []);
    setRooms((r.data as Room[]) ?? []);
    setBuildings((b.data as Building[]) ?? []);
    setSettings((s.data as Settings) ?? null);
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
          {viewMode === 'grouped' ? (
            <GroupedTenants
              groups={groupedView}
              loading={loading}
              canDelete={canDelete}
              onEdit={openEdit}
              onRemove={remove}
              onWa={setWaTenant}
            />
          ) : (
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
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Send WhatsApp message"
                          onClick={() => setWaTenant(t)}
                        >
                          <MessageCircle className="size-4 text-green-600" />
                        </Button>
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
    </div>
  );
}

// =====================================================================
// Grouped view: Building → Room → Tenants
// =====================================================================

function GroupedTenants({
  groups, loading, canDelete, onEdit, onRemove, onWa,
}: {
  groups: BuildingBucket[];
  loading: boolean;
  canDelete: boolean;
  onEdit: (t: Tenant) => void;
  onRemove: (id: string) => void;
  onWa: (t: Tenant) => void;
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
                                </div>
                                {t.phone && (
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {t.phone}
                                  </div>
                                )}
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

