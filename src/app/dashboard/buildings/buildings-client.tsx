'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Pencil, Trash2, Building2, BedDouble, Users, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { formatINR } from '@/lib/format';
import type { Building, Room, Role } from '@/lib/types';

type TenantLite = { id: string; room_id: string | null; status: string };

export function BuildingsClient({ role }: { role: Role }) {
  const supabase = createClient();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenants, setTenants] = useState<TenantLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [bOpen, setBOpen] = useState(false);
  const [bEditing, setBEditing] = useState<Building | null>(null);
  const [bName, setBName] = useState('');
  const [bAddress, setBAddress] = useState('');

  const [rOpen, setROpen] = useState(false);
  const [rEditing, setREditing] = useState<Room | null>(null);
  const [rBuildingId, setRBuildingId] = useState('');
  const [rNumber, setRNumber] = useState('');
  const [rCapacity, setRCapacity] = useState(1);
  const [rRent, setRRent] = useState(0);

  async function load() {
    setLoading(true);
    const [b, r, t] = await Promise.all([
      supabase.from('buildings').select('*').order('created_at'),
      supabase.from('rooms').select('*, building:buildings(*)').order('room_number'),
      supabase.from('tenants').select('id, room_id, status').eq('status', 'active'),
    ]);
    if (b.error) toast.error(b.error.message);
    if (r.error) toast.error(r.error.message);
    if (t.error) toast.error(t.error.message);
    setBuildings((b.data as Building[]) ?? []);
    setRooms((r.data as Room[]) ?? []);
    setTenants((t.data as TenantLite[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Derived occupancy stats -----
  const occByRoom = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tenants) {
      if (!t.room_id) continue;
      m.set(t.room_id, (m.get(t.room_id) ?? 0) + 1);
    }
    return m;
  }, [tenants]);

  const buildingStats = useMemo(() => {
    return buildings.map((b) => {
      const bRooms = rooms.filter((r) => r.building_id === b.id);
      const capacity = bRooms.reduce((s, r) => s + (r.capacity ?? 0), 0);
      const occupied = bRooms.reduce((s, r) => s + (occByRoom.get(r.id) ?? 0), 0);
      const available = Math.max(0, capacity - occupied);
      const fullRooms = bRooms.filter((r) => (occByRoom.get(r.id) ?? 0) >= r.capacity).length;
      const revenue = bRooms.reduce((s, r) => s + Number(r.monthly_rent ?? 0) * (r.capacity ?? 0), 0);
      const occPct = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
      return { building: b, rooms: bRooms, capacity, occupied, available, fullRooms, revenue, occPct };
    });
  }, [buildings, rooms, occByRoom]);

  const totals = useMemo(() => {
    return buildingStats.reduce(
      (acc, s) => ({
        rooms: acc.rooms + s.rooms.length,
        capacity: acc.capacity + s.capacity,
        occupied: acc.occupied + s.occupied,
        available: acc.available + s.available,
        revenue: acc.revenue + s.revenue,
      }),
      { rooms: 0, capacity: 0, occupied: 0, available: 0, revenue: 0 },
    );
  }, [buildingStats]);

  // ----- CRUD -----
  function openBuilding(b?: Building) {
    setBEditing(b ?? null);
    setBName(b?.name ?? '');
    setBAddress(b?.address ?? '');
    setBOpen(true);
  }

  async function saveBuilding(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name: bName, address: bAddress || null };
    const q = bEditing
      ? supabase.from('buildings').update(payload).eq('id', bEditing.id)
      : supabase.from('buildings').insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success(bEditing ? 'Building updated' : 'Building added');
    setBOpen(false);
    load();
  }

  async function deleteBuilding(id: string) {
    if (!confirm('Delete this building and all its rooms?')) return;
    const { error } = await supabase.from('buildings').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Building deleted');
    load();
  }

  function openRoom(r?: Room, presetBuildingId?: string) {
    setREditing(r ?? null);
    setRBuildingId(r?.building_id ?? presetBuildingId ?? buildings[0]?.id ?? '');
    setRNumber(r?.room_number ?? '');
    setRCapacity(r?.capacity ?? 1);
    setRRent(Number(r?.monthly_rent ?? 0));
    setROpen(true);
  }

  async function saveRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!rBuildingId) return toast.error('Add a building first.');
    if (rEditing) {
      const currentOcc = occByRoom.get(rEditing.id) ?? 0;
      if (rCapacity < currentOcc) {
        return toast.error(`Capacity cannot be less than current occupancy (${currentOcc}).`);
      }
    }
    const payload = {
      building_id: rBuildingId,
      room_number: rNumber,
      capacity: rCapacity,
      monthly_rent: rRent,
    };
    const q = rEditing
      ? supabase.from('rooms').update(payload).eq('id', rEditing.id)
      : supabase.from('rooms').insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success(rEditing ? 'Room updated' : 'Room added');
    setROpen(false);
    load();
  }

  async function deleteRoom(id: string) {
    if ((occByRoom.get(id) ?? 0) > 0) {
      return toast.error('Cannot delete: room has active tenants. Move them first.');
    }
    if (!confirm('Delete this room?')) return;
    const { error } = await supabase.from('rooms').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Room deleted');
    load();
  }

  const canDelete = role === 'owner';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Buildings & Rooms</h1>
          <p className="text-sm text-muted-foreground">
            Block-level view of every building, its rooms, and live occupancy.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={bOpen} onOpenChange={setBOpen}>
            <DialogTrigger className={buttonVariants()} onClick={() => openBuilding()}>
              <Plus className="size-4 mr-1" /> Building
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{bEditing ? 'Edit' : 'New'} building</DialogTitle>
              </DialogHeader>
              <form onSubmit={saveBuilding} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input required value={bName} onChange={(e) => setBName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={bAddress} onChange={(e) => setBAddress(e.target.value)} />
                </div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={rOpen} onOpenChange={setROpen}>
            <DialogTrigger className={buttonVariants({ variant: 'outline' })} onClick={() => openRoom()}>
              <Plus className="size-4 mr-1" /> Room
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{rEditing ? 'Edit' : 'New'} room</DialogTitle>
              </DialogHeader>
              <form onSubmit={saveRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label>Building</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background"
                    value={rBuildingId}
                    onChange={(e) => setRBuildingId(e.target.value)}
                    required
                  >
                    <option value="">Select building</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Room #</Label>
                    <Input required value={rNumber} onChange={(e) => setRNumber(e.target.value)} />
                  </div>
                  <div className="space-y-2"><Label>Capacity</Label>
                    <Input type="number" min={1} value={rCapacity}
                      onChange={(e) => setRCapacity(parseInt(e.target.value || '1'))} />
                  </div>
                  <div className="space-y-2"><Label>Rent (₹)</Label>
                    <Input type="number" min={0} value={rRent}
                      onChange={(e) => setRRent(parseFloat(e.target.value || '0'))} />
                  </div>
                </div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Portfolio totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile icon={<Building2 className="size-4" />} label="Buildings" value={buildings.length} />
        <StatTile icon={<BedDouble className="size-4" />} label="Rooms" value={totals.rooms} />
        <StatTile icon={<Users className="size-4" />} label="Occupied" value={`${totals.occupied} / ${totals.capacity}`} />
        <StatTile icon={<BedDouble className="size-4" />} label="Available beds" value={totals.available} accent={totals.available > 0 ? 'good' : 'warn'} />
        <StatTile icon={<IndianRupee className="size-4" />} label="Max monthly" value={formatINR(totals.revenue)} />
      </div>

      {/* Per-building blocks */}
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!loading && buildings.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          No buildings yet. Click <b>Building</b> to add one.
        </CardContent></Card>
      )}

      <div className="space-y-6">
        {buildingStats.map(({ building: b, rooms: bRooms, capacity, occupied, available, fullRooms, revenue, occPct }) => {
          const isFull = capacity > 0 && available === 0;
          return (
            <Card key={b.id} className={isFull ? 'border-amber-500/50' : undefined}>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <Building2 className="size-5 text-muted-foreground" />
                    {b.name}
                    {isFull && <Badge variant="destructive">Fully occupied</Badge>}
                    {!isFull && capacity > 0 && available <= 2 && (
                      <Badge variant="secondary">Almost full</Badge>
                    )}
                  </CardTitle>
                  {b.address && <p className="text-sm text-muted-foreground">{b.address}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openRoom(undefined, b.id)}>
                    <Plus className="size-4 mr-1" /> Room
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openBuilding(b)}>
                    <Pencil className="size-4" />
                  </Button>
                  {canDelete && (
                    <Button size="icon" variant="ghost" onClick={() => deleteBuilding(b.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Per-building stats */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <MiniStat label="Rooms" value={bRooms.length} />
                  <MiniStat label="Capacity" value={capacity} />
                  <MiniStat label="Occupied" value={occupied} />
                  <MiniStat label="Available" value={available} accent={available > 0 ? 'good' : 'warn'} />
                  <MiniStat label="Full rooms" value={fullRooms} />
                  <MiniStat label="Max / month" value={formatINR(revenue)} />
                </div>
                {/* Occupancy bar */}
                {capacity > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Occupancy</span><span>{occPct}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded">
                      <div
                        className={`h-2 rounded ${occPct >= 100 ? 'bg-amber-500' : occPct >= 80 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, occPct)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Rooms table grouped under this building */}
                {bRooms.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">
                    No rooms in this building yet.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Room #</TableHead>
                        <TableHead>Capacity</TableHead>
                        <TableHead>Occupied</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Rent</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bRooms.map((r) => {
                        const occ = occByRoom.get(r.id) ?? 0;
                        const avail = Math.max(0, r.capacity - occ);
                        const roomFull = occ >= r.capacity;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.room_number}</TableCell>
                            <TableCell>{r.capacity}</TableCell>
                            <TableCell>{occ}</TableCell>
                            <TableCell>{avail}</TableCell>
                            <TableCell>
                              {roomFull ? (
                                <Badge variant="destructive">Full</Badge>
                              ) : occ === 0 ? (
                                <Badge variant="secondary">Empty</Badge>
                              ) : (
                                <Badge>Partial</Badge>
                              )}
                            </TableCell>
                            <TableCell>{formatINR(r.monthly_rent)}</TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button size="icon" variant="ghost" onClick={() => openRoom(r)}>
                                <Pencil className="size-4" />
                              </Button>
                              {canDelete && (
                                <Button size="icon" variant="ghost" onClick={() => deleteRoom(r.id)}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatTile({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: 'good' | 'warn' }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={`text-xl font-semibold mt-1 ${accent === 'good' ? 'text-emerald-600' : accent === 'warn' ? 'text-amber-600' : ''}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label, value, accent,
}: { label: string; value: React.ReactNode; accent?: 'good' | 'warn' }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${accent === 'good' ? 'text-emerald-600' : accent === 'warn' ? 'text-amber-600' : ''}`}>
        {value}
      </div>
    </div>
  );
}
