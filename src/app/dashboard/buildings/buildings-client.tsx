'use client';

import { useEffect, useState } from 'react';
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
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatINR } from '@/lib/format';
import type { Building, Room, Role } from '@/lib/types';

export function BuildingsClient({ role }: { role: Role }) {
  const supabase = createClient();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
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
    const [b, r] = await Promise.all([
      supabase.from('buildings').select('*').order('created_at'),
      supabase
        .from('rooms')
        .select('*, building:buildings(*)')
        .order('room_number'),
    ]);
    if (b.error) toast.error(b.error.message);
    if (r.error) toast.error(r.error.message);
    setBuildings((b.data as Building[]) ?? []);
    setRooms((r.data as Room[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function openRoom(r?: Room) {
    setREditing(r ?? null);
    setRBuildingId(r?.building_id ?? buildings[0]?.id ?? '');
    setRNumber(r?.room_number ?? '');
    setRCapacity(r?.capacity ?? 1);
    setRRent(Number(r?.monthly_rent ?? 0));
    setROpen(true);
  }

  async function saveRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!rBuildingId) return toast.error('Add a building first.');
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
    if (!confirm('Delete this room?')) return;
    const { error } = await supabase.from('rooms').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Room deleted');
    load();
  }

  const canDelete = role === 'owner';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Buildings & Rooms</h1>
          <p className="text-sm text-muted-foreground">
            Add buildings, then add rooms inside each.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={bOpen} onOpenChange={setBOpen}>
            <DialogTrigger className={buttonVariants()} onClick={() => openBuilding()}>
              <Plus className="size-4 mr-1" />
              Building
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{bEditing ? 'Edit' : 'New'} building</DialogTitle>
              </DialogHeader>
              <form onSubmit={saveBuilding} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    required
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={bAddress}
                    onChange={(e) => setBAddress(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={rOpen} onOpenChange={setROpen}>
            <DialogTrigger className={buttonVariants({ variant: 'outline' })} onClick={() => openRoom()}>
              <Plus className="size-4 mr-1" />
              Room
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
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2 col-span-1">
                    <Label>Room #</Label>
                    <Input
                      required
                      value={rNumber}
                      onChange={(e) => setRNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label>Capacity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={rCapacity}
                      onChange={(e) =>
                        setRCapacity(parseInt(e.target.value || '1'))
                      }
                    />
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label>Rent (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={rRent}
                      onChange={(e) =>
                        setRRent(parseFloat(e.target.value || '0'))
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buildings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Rooms</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={4}>Loading…</TableCell>
                </TableRow>
              )}
              {!loading && buildings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No buildings yet.
                  </TableCell>
                </TableRow>
              )}
              {buildings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.address || '-'}</TableCell>
                  <TableCell>
                    {rooms.filter((r) => r.building_id === b.id).length}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openBuilding(b)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteBuilding(b.id)}
                      >
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

      <Card>
        <CardHeader>
          <CardTitle>Rooms</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Building</TableHead>
                <TableHead>Room #</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Rent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5}>Loading…</TableCell>
                </TableRow>
              )}
              {!loading && rooms.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No rooms yet.
                  </TableCell>
                </TableRow>
              )}
              {rooms.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.building?.name ?? '-'}</TableCell>
                  <TableCell className="font-medium">{r.room_number}</TableCell>
                  <TableCell>{r.capacity}</TableCell>
                  <TableCell>{formatINR(r.monthly_rent)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openRoom(r)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteRoom(r.id)}
                      >
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
