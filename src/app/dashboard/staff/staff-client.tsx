'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Profile } from '@/lib/types';

export function StaffClient({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient();
  const [list, setList] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'manager' as 'manager' | 'owner' });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) toast.error(error.message);
    setList((data as Profile[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
    const j = await res.json();
    if (!res.ok) return toast.error(j.error ?? 'Failed');
    toast.success('Staff added');
    setOpen(false);
    setForm({ name: '', email: '', phone: '', password: '', role: 'manager' });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Remove this user? They will lose access.')) return;
    const res = await fetch('/api/staff', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const j = await res.json();
    if (!res.ok) return toast.error(j.error ?? 'Failed');
    toast.success('Removed'); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground">Owners can manage everything. Managers can&apos;t delete records or change settings.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className={buttonVariants()}><Plus className="size-4 mr-1" />Add staff</DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add staff member</DialogTitle></DialogHeader>
            <form onSubmit={add} className="space-y-3">
              <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Temporary password</Label><Input type="password" required minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select className="w-full border rounded-md h-9 px-2 bg-background" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'manager' | 'owner' }))}>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Members ({list.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={4}>Loading…</TableCell></TableRow>}
              {list.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}{p.id === currentUserId && <span className="text-xs text-muted-foreground"> (you)</span>}</TableCell>
                  <TableCell><Badge variant={p.role === 'owner' ? 'default' : 'secondary'}>{p.role}</Badge></TableCell>
                  <TableCell>{p.phone || '-'}</TableCell>
                  <TableCell className="text-right">
                    {p.id !== currentUserId && (
                      <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="size-4 text-destructive" /></Button>
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
