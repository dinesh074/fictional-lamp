'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Download, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ImageUpload } from '@/components/image-upload';
import { downloadCSV, formatINR, photoPublicUrl } from '@/lib/format';
import type { Product, Role } from '@/lib/types';

type Form = Partial<Product>;

export function ProductsClient({ role }: { role: Role }) {
  const supabase = createClient();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>({ active: true, unit: 'pcs', stock_qty: 0 });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) toast.error(error.message);
    setItems((data as Product[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({
      active: true,
      unit: 'pcs',
      stock_qty: 0,
      low_stock_threshold: 0,
      cost_price: 0,
      sell_price: 0,
    });
    setOpen(true);
  }
  function openEdit(p: Product) { setEditing(p); setForm(p); setOpen(true); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return toast.error('Name required');
    const payload = {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      unit: form.unit || 'pcs',
      cost_price: Number(form.cost_price ?? 0),
      sell_price: Number(form.sell_price ?? 0),
      stock_qty: Number(form.stock_qty ?? 0),
      low_stock_threshold: Number(form.low_stock_threshold ?? 0),
      photo_url: form.photo_url ?? null,
      active: form.active ?? true,
    };
    const q = editing
      ? supabase.from('products').update(payload).eq('id', editing.id)
      : supabase.from('products').insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success(editing ? 'Updated' : 'Added');
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this product? Past sales remain.')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return toast.error(error.message);
    load();
  }

  const filtered = useMemo(
    () => items.filter((p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    ),
    [items, search]
  );
  const lowStock = items.filter((p) => p.active && p.stock_qty <= p.low_stock_threshold).length;
  const inventoryValue = items.reduce((s, p) => s + p.stock_qty * p.cost_price, 0);

  function exportCSV() {
    downloadCSV(
      filtered.map((p) => ({
        Name: p.name,
        SKU: p.sku ?? '',
        Category: p.category ?? '',
        Unit: p.unit,
        Cost: p.cost_price,
        Sell: p.sell_price,
        Stock: p.stock_qty,
        LowThreshold: p.low_stock_threshold,
        Active: p.active,
      })),
      `products-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">Store inventory & pricing.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4 mr-1" />Export
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className={buttonVariants()} onClick={openNew}>
              <Plus className="size-4 mr-1" />Product
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} product</DialogTitle></DialogHeader>
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
                  <Label>SKU</Label>
                  <Input
                    value={form.sku ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    value={form.category ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={form.unit ?? 'pcs'}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="pcs, kg, ltr…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stock qty</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.stock_qty ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, stock_qty: parseFloat(e.target.value || '0') }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cost price (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.cost_price ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, cost_price: parseFloat(e.target.value || '0') }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sell price (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sell_price ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, sell_price: parseFloat(e.target.value || '0') }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Low-stock threshold</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.low_stock_threshold ?? 0}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, low_stock_threshold: parseFloat(e.target.value || '0') }))
                    }
                  />
                </div>
                <div className="space-y-2 flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active ?? true}
                      onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    />
                    Active
                  </label>
                </div>
                <div className="col-span-2">
                  <ImageUpload
                    bucket="product-photos"
                    pathPrefix="products"
                    value={form.photo_url}
                    onChange={(url) => setForm((f) => ({ ...f, photo_url: url }))}
                    label="Product photo (≤150 KB)"
                  />
                </div>
                <DialogFooter className="col-span-2"><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Products</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{items.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Inventory value</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatINR(inventoryValue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <AlertTriangle className="size-4 text-amber-600" />Low stock
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{lowStock}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle>All products</CardTitle>
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Sell</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow>}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground">No products.</TableCell></TableRow>
              )}
              {filtered.map((p) => {
                const low = p.active && p.stock_qty <= p.low_stock_threshold;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoPublicUrl(p.photo_url, 'product-photos') ?? ''}
                          alt=""
                          className="size-10 rounded object-cover border"
                        />
                      ) : (
                        <div className="size-10 rounded bg-muted border" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.name}
                      {!p.active && <Badge variant="secondary" className="ml-1 text-[10px]">inactive</Badge>}
                      {low && <Badge variant="destructive" className="ml-1 text-[10px]">low</Badge>}
                      {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
                    </TableCell>
                    <TableCell>{p.category ?? '-'}</TableCell>
                    <TableCell className="text-right">{formatINR(p.cost_price)}</TableCell>
                    <TableCell className="text-right">{formatINR(p.sell_price)}</TableCell>
                    <TableCell className="text-right">{p.stock_qty} {p.unit}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="size-4" />
                      </Button>
                      {role === 'owner' && (
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
    </div>
  );
}

