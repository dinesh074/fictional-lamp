'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { KeyRound, Save, Building2, IndianRupee } from 'lucide-react';
import type { Settings } from '@/lib/types';

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
    </div>
  );
}

