'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { Tenant } from '@/lib/types';

export function HoldDialog({
  tenant,
  open,
  onOpenChange,
  onSaved,
}: {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [reason, setReason] = useState(tenant?.payment_hold_reason ?? '');
  const [until, setUntil] = useState(tenant?.payment_hold_until ?? '');
  const [saving, setSaving] = useState(false);

  async function setHold(active: boolean) {
    if (!tenant) return;
    setSaving(true);
    const { error } = await supabase.from('tenants').update({
      payment_hold: active,
      payment_hold_reason: active ? (reason || null) : null,
      payment_hold_until: active ? (until || null) : null,
    }).eq('id', tenant.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(active ? 'Payment hold applied' : 'Payment hold cleared');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment hold · {tenant?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Tenant requested deferral until salary credit."
            />
          </div>
          <div className="space-y-2">
            <Label>Hold until (optional)</Label>
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Reminders & overdue flags will be suppressed until this date. Leave blank for indefinite hold.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {tenant?.payment_hold && (
            <Button variant="outline" disabled={saving} onClick={() => setHold(false)}>
              Clear hold
            </Button>
          )}
          <Button disabled={saving} onClick={() => setHold(true)}>
            {tenant?.payment_hold ? 'Update hold' : 'Apply hold'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

