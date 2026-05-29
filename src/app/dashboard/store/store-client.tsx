'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Minus, Trash2, ShoppingCart, Package } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatINR, formatDate, photoPublicUrl } from '@/lib/format';
import { renderTemplate, waMeUrl } from '@/lib/wa';
import { upiLink } from '@/lib/upi';
import type { Product, Tenant, StoreSale, StorePaymentMethod, Role, Settings } from '@/lib/types';

interface CartItem { product: Product; qty: number; }

export function StoreClient({ role: _role }: { role: Role }) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recent, setRecent] = useState<StoreSale[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [payment, setPayment] = useState<StorePaymentMethod>('cash');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [p, t, s, r] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('tenants').select('id,name,phone,room:rooms(*,building:buildings(*))').eq('status', 'active').order('name'),
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('store_sales').select('*, tenant:tenants(id,name)').order('created_at', { ascending: false }).limit(10),
    ]);
    setProducts((p.data as Product[]) ?? []);
    setTenants(((t.data as unknown) as Tenant[]) ?? []);
    setSettings((s.data as Settings) ?? null);
    setRecent((r.data as StoreSale[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  const filteredProducts = useMemo(
    () => products.filter((p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    ),
    [products, search]
  );

  function add(p: Product) {
    setCart((c) => {
      const ex = c.find((x) => x.product.id === p.id);
      if (ex) return c.map((x) => x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { product: p, qty: 1 }];
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) =>
      c.map((x) => x.product.id === id ? { ...x, qty: Math.max(0, qty) } : x).filter((x) => x.qty > 0)
    );
  }
  function remove(id: string) {
    setCart((c) => c.filter((x) => x.product.id !== id));
  }

  const subtotal = cart.reduce((s, x) => s + x.qty * x.product.sell_price, 0);
  const total = Math.max(0, subtotal - (discount || 0));

  async function complete() {
    if (cart.length === 0) return toast.error('Cart is empty');
    if (payment === 'ledger' && !tenantId) return toast.error('Choose a tenant for ledger sales');
    setBusy(true);
    try {
      const saleRes = await supabase.from('store_sales').insert({
        tenant_id: tenantId || null,
        sale_date: new Date().toISOString().slice(0, 10),
        subtotal,
        discount: discount || 0,
        total,
        payment_method: payment,
        notes: notes || null,
      }).select('id').single();
      if (saleRes.error) throw saleRes.error;
      const saleId = saleRes.data.id as string;
      const items = cart.map((c) => ({
        sale_id: saleId,
        product_id: c.product.id,
        qty: c.qty,
        unit_price: c.product.sell_price,
        unit_cost: c.product.cost_price,
        line_total: c.qty * c.product.sell_price,
      }));
      const itemsRes = await supabase.from('store_sale_items').insert(items);
      if (itemsRes.error) throw itemsRes.error;
      toast.success(`Sale ${formatINR(total)} recorded`);
      if (payment === 'ledger' && tenantId) {
        const tenant = tenants.find((t) => t.id === tenantId);
        if (tenant?.phone) {
          const link = settings?.upi_vpa
            ? upiLink({
                pa: settings.upi_vpa,
                pn: settings.upi_payee_name ?? settings.hostel_name,
                am: total,
                tn: 'Store purchase',
              })
            : null;
          const url = waMeUrl(
            tenant.phone,
            renderTemplate('store_purchase', { tenant, settings, amount: total, upiLink: link })
          );
          if (url && confirm('Send WhatsApp receipt to tenant?')) window.open(url, '_blank');
        }
      }
      setCart([]); setDiscount(0); setNotes(''); setTenantId(''); setPayment('cash');
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Store</h1>
          <p className="text-sm text-muted-foreground">Point-of-sale for groceries and supplies.</p>
        </div>
        <Link href="/dashboard/store/products" className={buttonVariants({ variant: 'outline' })}>
          <Package className="size-4 mr-1" /> Manage products
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row justify-between items-center gap-2">
            <CardTitle>Products</CardTitle>
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map((p) => {
                const low = p.stock_qty <= p.low_stock_threshold;
                return (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    type="button"
                    className="border rounded-md p-2 text-left hover:bg-accent transition flex flex-col gap-1"
                  >
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoPublicUrl(p.photo_url, 'product-photos') ?? ''}
                        alt=""
                        className="w-full aspect-square object-cover rounded"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-muted rounded" />
                    )}
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>{formatINR(p.sell_price)}</span>
                      <span className={low ? 'text-amber-600' : ''}>{p.stock_qty} {p.unit}</span>
                    </div>
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <div className="col-span-full text-sm text-muted-foreground">
                  No products.{' '}
                  <Link className="underline" href="/dashboard/store/products">Add some</Link>.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="size-4" />Cart
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 && <div className="text-sm text-muted-foreground">Tap products to add.</div>}
            {cart.map((c) => (
              <div key={c.product.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1 truncate">
                  <div className="font-medium truncate">{c.product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatINR(c.product.sell_price)} × {c.qty}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setQty(c.product.id, c.qty - 1)}>
                  <Minus className="size-3" />
                </Button>
                <Input
                  className="w-14 h-7 text-center"
                  type="number"
                  step="0.001"
                  value={c.qty}
                  onChange={(e) => setQty(c.product.id, parseFloat(e.target.value || '0'))}
                />
                <Button size="icon" variant="ghost" onClick={() => setQty(c.product.id, c.qty + 1)}>
                  <Plus className="size-3" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(c.product.id)}>
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
            <div className="border-t pt-3 space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Tenant (optional / required for ledger)</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 bg-background text-sm"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                >
                  <option value="">Walk-in / not linked</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Payment</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 bg-background text-sm"
                    value={payment}
                    onChange={(e) => setPayment(e.target.value as StorePaymentMethod)}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="ledger">Add to tenant ledger</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Discount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value || '0'))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="flex justify-between text-sm pt-1">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span>− {formatINR(discount || 0)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatINR(total)}</span>
              </div>
              <Button className="w-full" onClick={complete} disabled={busy || cart.length === 0}>
                Complete sale
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent sales</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 && <div className="text-sm text-muted-foreground">No sales yet.</div>}
          <div className="space-y-1">
            {recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b py-1 last:border-0">
                <div>
                  <span className="font-medium">{formatINR(s.total)}</span>
                  <span className="text-muted-foreground"> · {formatDate(s.sale_date)}</span>
                  {s.tenant?.name && <span className="text-muted-foreground"> · {s.tenant.name}</span>}
                </div>
                <Badge variant="outline" className="text-[10px]">{s.payment_method}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

