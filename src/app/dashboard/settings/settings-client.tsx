'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { KeyRound, Save, Building2, IndianRupee, MessageCircle, Plus, Trash2, RotateCcw } from 'lucide-react';
import type { Settings, WaTemplate, WaTemplateCategory } from '@/lib/types';

export function SettingsClient({ initial }: { initial: Settings }) {
  const supabase = createClient();
  const [s, setS] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);

  // Password change state
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from('settings')
      .update({
        hostel_name: s.hostel_name,
        hostel_address: s.hostel_address,
        hostel_gst: s.hostel_gst,
        hostel_pan: s.hostel_pan,
        hostel_phone: s.hostel_phone,
        hostel_email: s.hostel_email,
        payment_due_day: s.payment_due_day,
        invoice_prefix: s.invoice_prefix,
        upi_vpa: s.upi_vpa ?? null,
        upi_payee_name: s.upi_payee_name ?? null,
      })
      .eq('id', 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Settings saved');
  }

  function up<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 8) return toast.error('Password must be at least 8 characters.');
    if (pw1 !== pw2) return toast.error('Passwords do not match.');
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setPwBusy(false);
    if (error) return toast.error(error.message);
    setPw1(''); setPw2('');
    toast.success('Password updated. Next sign-in will use the new password.');
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-xl p-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-white/90">
          Business details used on invoices and WhatsApp reminders.
        </p>
      </div>

      <Card className="border-l-4 border-l-indigo-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-indigo-500" />Hostel details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Hostel name</Label>
              <Input value={s.hostel_name} onChange={(e) => up('hostel_name', e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Address</Label>
              <Input
                value={s.hostel_address ?? ''}
                onChange={(e) => up('hostel_address', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={s.hostel_phone ?? ''}
                onChange={(e) => up('hostel_phone', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={s.hostel_email ?? ''}
                onChange={(e) => up('hostel_email', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>GSTIN</Label>
              <Input
                value={s.hostel_gst ?? ''}
                onChange={(e) => up('hostel_gst', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>PAN</Label>
              <Input
                value={s.hostel_pan ?? ''}
                onChange={(e) => up('hostel_pan', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment due day of month</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={s.payment_due_day}
                onChange={(e) => up('payment_due_day', parseInt(e.target.value || '5'))}
              />
            </div>
            <div className="space-y-2">
              <Label>Invoice prefix</Label>
              <Input
                value={s.invoice_prefix}
                onChange={(e) => up('invoice_prefix', e.target.value)}
              />
            </div>

            <div className="col-span-2 mt-2 pt-3 border-t">
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                <IndianRupee className="size-4 text-emerald-600" />UPI for payments
              </div>
            </div>
            <div className="space-y-2">
              <Label>UPI VPA (UPI ID)</Label>
              <Input
                placeholder="hostel@upi"
                value={s.upi_vpa ?? ''}
                onChange={(e) => up('upi_vpa', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payee name</Label>
              <Input
                placeholder="As shown in UPI app"
                value={s.upi_payee_name ?? ''}
                onChange={(e) => up('upi_payee_name', e.target.value)}
              />
            </div>

            <div className="col-span-2">
              <Button type="submit" disabled={saving}>
                <Save className="size-4 mr-1" />
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-amber-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-amber-500" />Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid sm:grid-cols-2 gap-3 max-w-md">
            <div className="space-y-2 sm:col-span-2">
              <Label>New password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Confirm new password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pwBusy} variant="default">
                <KeyRound className="size-4 mr-1" />
                {pwBusy ? 'Updating…' : 'Update password'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Minimum 8 characters. You will stay signed in on this device.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <WaTemplatesCard />
    </div>
  );
}

// =====================================================================
// WhatsApp templates manager
// =====================================================================

const PLACEHOLDER_HELP: { token: string; desc: string }[] = [
  { token: '{{tenant_name}}', desc: 'Recipient tenant name' },
  { token: '{{hostel_name}}', desc: 'Your hostel name' },
  { token: '{{hostel_phone}}', desc: 'Hostel contact phone' },
  { token: '{{contact_line}}', desc: '" Contact: <phone>." or empty' },
  { token: '{{upi_line}}', desc: 'UPI pay line (auto-filled if available)' },
  { token: '{{upi_vpa}}', desc: 'UPI ID alone' },
  { token: '{{room}}', desc: 'Tenant room number' },
  { token: '{{building}}', desc: 'Tenant building name' },
  { token: '{{amount}}', desc: 'Payment amount (₹)' },
  { token: '{{period_month}}', desc: 'Rent month, e.g. May 2026' },
  { token: '{{due_date}}', desc: 'Rent due date' },
  { token: '{{available_beds}}', desc: 'Beds available across hostel' },
  { token: '{{building_summary}}', desc: 'Comma list of building → beds' },
  { token: '{{event_name}}', desc: 'Custom (invitation)' },
  { token: '{{event_date}}', desc: 'Custom (invitation)' },
  { token: '{{occasion}}', desc: 'Custom (celebration)' },
  { token: '{{offer_details}}', desc: 'Custom (offer)' },
  { token: '{{valid_till}}', desc: 'Custom (offer)' },
];

const CATEGORIES: WaTemplateCategory[] = [
  'payment', 'invitation', 'celebration', 'offer', 'availability', 'generic',
];

function WaTemplatesCard() {
  const supabase = createClient();
  const [items, setItems] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('wa_templates')
      .select('*')
      .order('sort_order');
    setLoading(false);
    if (error) return toast.error(error.message);
    setItems((data as WaTemplate[]) ?? []);
    setDirty({});
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function patch(id: string, p: Partial<WaTemplate>) {
    setItems((arr) => arr.map((t) => (t.id === id ? { ...t, ...p } : t)));
    setDirty((d) => ({ ...d, [id]: true }));
  }

  async function saveOne(t: WaTemplate) {
    setSaving((s) => ({ ...s, [t.id]: true }));
    const { error } = await supabase
      .from('wa_templates')
      .update({
        label: t.label,
        body: t.body,
        category: t.category,
        enabled: t.enabled,
        sort_order: t.sort_order,
      })
      .eq('id', t.id);
    setSaving((s) => ({ ...s, [t.id]: false }));
    if (error) return toast.error(error.message);
    setDirty((d) => ({ ...d, [t.id]: false }));
    toast.success(`"${t.label}" saved`);
  }

  async function addNew() {
    const key = `custom_${Date.now()}`;
    const { data, error } = await supabase
      .from('wa_templates')
      .insert({
        key, label: 'New template', category: 'generic',
        body: 'Hi {{tenant_name}}, …', sort_order: 200, enabled: true, is_system: false,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setItems((arr) => [...arr, data as WaTemplate]);
    toast.success('Template added');
  }

  async function removeOne(t: WaTemplate) {
    if (t.is_system) return toast.error('System templates cannot be deleted (disable instead).');
    if (!confirm(`Delete "${t.label}"?`)) return;
    const { error } = await supabase.from('wa_templates').delete().eq('id', t.id);
    if (error) return toast.error(error.message);
    setItems((arr) => arr.filter((x) => x.id !== t.id));
  }

  return (
    <Card className="border-l-4 border-l-emerald-500">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-5 text-emerald-600" />WhatsApp templates
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RotateCcw className="size-4 mr-1" />Reload
          </Button>
          <Button size="sm" onClick={addNew}>
            <Plus className="size-4 mr-1" />Add template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <details className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
          <summary className="cursor-pointer font-medium text-foreground">
            Available placeholders ({PLACEHOLDER_HELP.length})
          </summary>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
            {PLACEHOLDER_HELP.map((p) => (
              <div key={p.token}>
                <code className="text-emerald-700 dark:text-emerald-400">{p.token}</code>
                {' — '}{p.desc}
              </div>
            ))}
          </div>
        </details>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        )}

        <div className="space-y-4">
          {items.map((t) => (
            <div
              key={t.id}
              className={`border rounded-lg p-3 space-y-3 ${t.enabled ? '' : 'opacity-60'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="flex-1 min-w-[200px] h-8"
                  value={t.label}
                  onChange={(e) => patch(t.id, { label: e.target.value })}
                />
                <select
                  className="border rounded-md h-8 px-2 bg-background text-sm"
                  value={t.category}
                  onChange={(e) => patch(t.id, { category: e.target.value as WaTemplateCategory })}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={(e) => patch(t.id, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                {t.is_system && <Badge variant="secondary" className="text-[10px]">system</Badge>}
                <code className="text-[10px] text-muted-foreground">{t.key}</code>
              </div>
              <Textarea
                rows={4}
                value={t.body}
                onChange={(e) => patch(t.id, { body: e.target.value })}
                className="font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                {!t.is_system && (
                  <Button size="sm" variant="ghost" onClick={() => removeOne(t)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={!dirty[t.id] || saving[t.id]}
                  onClick={() => saveOne(t)}
                >
                  <Save className="size-4 mr-1" />
                  {saving[t.id] ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

