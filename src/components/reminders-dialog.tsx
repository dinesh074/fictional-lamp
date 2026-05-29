'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { Payment, Settings, Tenant } from '@/lib/types';
import { renderTemplate, waMeUrl, type ReminderTemplate } from '@/lib/wa';
import { tenantOnHold } from '@/lib/dues';
import { upiLink } from '@/lib/upi';
import { formatINR, formatDate, formatMonth } from '@/lib/format';

interface Target { payment: Payment; tenant: Tenant; }

export function RemindersDialog({
  payments,
  settings,
  trigger,
}: {
  payments: Payment[];
  settings: Settings | null;
  trigger?: React.ReactNode;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<ReminderTemplate>('payment_due');
  const [customSuffix, setCustomSuffix] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<'all_pending' | 'selected'>('all_pending');

  const targets = useMemo<Target[]>(() => {
    return payments
      .filter((p) => p.status !== 'paid')
      .map((p) => ({ payment: p, tenant: p.tenant! }))
      .filter((t) => t.tenant && t.tenant.phone)
      .filter((t) => !tenantOnHold(t.tenant));
  }, [payments]);

  const active = useMemo(() => {
    return scope === 'selected'
      ? targets.filter((t) => selectedIds.has(t.payment.id))
      : targets;
  }, [targets, scope, selectedIds]);

  function toggle(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function buildMessage(t: Target) {
    const link = settings?.upi_vpa
      ? upiLink({
          pa: settings.upi_vpa,
          pn: settings.upi_payee_name ?? settings.hostel_name,
          am: t.payment.amount,
          tn: `Rent ${formatMonth(t.payment.period_month)}`,
        })
      : null;
    const base = renderTemplate(template, {
      tenant: t.tenant,
      settings,
      payment: t.payment,
      upiLink: link,
    });
    return customSuffix ? `${base}\n\n${customSuffix}` : base;
  }

  async function logSend(t: Target, message: string) {
    await supabase.from('notifications_log').insert({
      tenant_id: t.tenant.id,
      channel: 'whatsapp',
      template,
      message,
      status: 'clicked',
    });
  }

  async function openOne(t: Target) {
    const msg = buildMessage(t);
    const url = waMeUrl(t.tenant.phone, msg);
    if (!url) return toast.error('No phone for tenant');
    window.open(url, '_blank', 'noopener,noreferrer');
    await logSend(t, msg);
  }

  async function openAll() {
    if (active.length === 0) return toast.error('Nothing to send.');
    for (const t of active) {
      const msg = buildMessage(t);
      const url = waMeUrl(t.tenant.phone, msg);
      if (!url) continue;
      window.open(url, '_blank', 'noopener,noreferrer');
      await logSend(t, msg);
      await new Promise((r) => setTimeout(r, 250));
    }
    toast.success(`Opened ${active.length} WhatsApp chat${active.length === 1 ? '' : 's'}.`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: 'outline' })}>
        <MessageCircle className="size-4 mr-1 text-green-600" />
        Send WhatsApp reminders
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>WhatsApp payment reminders</DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Template</Label>
            <select
              className="w-full border rounded-md h-9 px-2 bg-background text-sm"
              value={template}
              onChange={(e) => setTemplate(e.target.value as ReminderTemplate)}
            >
              <option value="payment_due">Payment due</option>
              <option value="payment_overdue">Payment overdue</option>
              <option value="payment_received">Payment received</option>
              <option value="generic">Generic</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Scope</Label>
            <select
              className="w-full border rounded-md h-9 px-2 bg-background text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="all_pending">All pending ({targets.length})</option>
              <option value="selected">Selected only ({selectedIds.size})</option>
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Append message (optional)</Label>
            <Textarea
              rows={2}
              value={customSuffix}
              onChange={(e) => setCustomSuffix(e.target.value)}
              placeholder="Extra note appended to every message…"
            />
          </div>
        </div>

        <div className="border rounded-md max-h-80 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Send</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No pending payments with phone numbers (excluding holds).
                  </TableCell>
                </TableRow>
              )}
              {targets.map((t) => (
                <TableRow key={t.payment.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.payment.id)}
                      onChange={() => toggle(t.payment.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{t.tenant.name}</div>
                    <div className="text-xs text-muted-foreground">{t.tenant.phone}</div>
                  </TableCell>
                  <TableCell>{formatINR(t.payment.amount)}</TableCell>
                  <TableCell>{formatDate(t.payment.due_date)}</TableCell>
                  <TableCell>
                    <Badge variant={t.payment.status === 'overdue' ? 'destructive' : 'secondary'}>
                      {t.payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openOne(t)}>
                      <ExternalLink className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <div className="text-xs text-muted-foreground mr-auto">
            Opens wa.me in new tabs. Allow pop-ups for this site.
          </div>
          <Button onClick={openAll} disabled={active.length === 0}>
            <MessageCircle className="size-4 mr-1" />
            Send to {active.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
