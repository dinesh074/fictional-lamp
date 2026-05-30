'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  buildTenantVars, renderCustomTemplate, waMeUrl,
} from '@/lib/wa';
import type { Settings, Tenant, WaTemplate } from '@/lib/types';

export interface WaMessageDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: Pick<Tenant, 'id' | 'name' | 'phone' | 'room'>;
  settings: Pick<Settings, 'hostel_name' | 'hostel_phone' | 'upi_vpa'> | null;
  /** Pre-select a template key (e.g. 'payment_due') */
  defaultTemplateKey?: string;
  /** Optional context such as a pending payment */
  paymentCtx?: {
    amount: number;
    period_month: string;
    due_date: string;
  } | null;
  /** Optional availability summary used by 'availability' template */
  availability?: { availableBeds: number; buildingSummary: string };
  /** Optional UPI deep-link */
  upiLink?: string | null;
}

export function WaMessageDialog({
  open, onOpenChange, tenant, settings, defaultTemplateKey,
  paymentCtx, availability, upiLink,
}: WaMessageDialogProps) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>(defaultTemplateKey ?? '');
  const [message, setMessage] = useState<string>('');
  // free-form variables (only the ones the picked template uses)
  const [extraVars, setExtraVars] = useState<Record<string, string>>({});

  // Fetch templates when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('wa_templates')
      .select('*')
      .eq('enabled', true)
      .order('sort_order')
      .then(({ data, error }) => {
        setLoading(false);
        if (error) { toast.error(error.message); return; }
        const list = (data as WaTemplate[]) ?? [];
        setTemplates(list);
        if (!selectedKey && list.length) {
          setSelectedKey(defaultTemplateKey && list.find((t) => t.key === defaultTemplateKey)
            ? defaultTemplateKey : list[0].key);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const baseVars = useMemo(
    () => buildTenantVars({
      tenant,
      settings,
      payment: paymentCtx ?? undefined,
      upiLink: upiLink ?? null,
      availableBeds: availability?.availableBeds,
      buildingSummary: availability?.buildingSummary,
    }),
    [tenant, settings, paymentCtx, upiLink, availability],
  );

  const selected = templates.find((t) => t.key === selectedKey) ?? null;

  // detect placeholders that aren't auto-filled (so we can show inputs)
  const unfilledPlaceholders = useMemo(() => {
    if (!selected) return [] as string[];
    const all = Array.from(selected.body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((m) => m[1]);
    const unique = Array.from(new Set(all));
    return unique.filter((k) => {
      const v = (baseVars as Record<string, unknown>)[k];
      return v === undefined || v === null || v === '';
    });
  }, [selected, baseVars]);

  // Re-render message whenever template / vars change
  useEffect(() => {
    if (!selected) { setMessage(''); return; }
    const merged: Record<string, string | number | null | undefined> = {
      ...baseVars,
      ...extraVars,
    };
    setMessage(renderCustomTemplate(selected.body, merged));
  }, [selected, baseVars, extraVars]);

  const url = waMeUrl(tenant.phone, message);

  async function send() {
    if (!url) { toast.error('Tenant has no valid phone number.'); return; }
    // Log the outbound message (best-effort).
    await supabase.from('notifications_log').insert({
      tenant_id: tenant.id,
      channel: 'whatsapp',
      template: selected?.key ?? null,
      message,
      status: 'clicked',
    });
    window.open(url, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-5 text-green-600" />
            WhatsApp — {tenant.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Template</Label>
            <select
              className="w-full border rounded-md h-9 px-2 bg-background text-sm"
              value={selectedKey}
              onChange={(e) => { setSelectedKey(e.target.value); setExtraVars({}); }}
              disabled={loading || templates.length === 0}
            >
              {loading && <option>Loading…</option>}
              {!loading && templates.length === 0 && (
                <option>No templates configured</option>
              )}
              {templates.map((t) => (
                <option key={t.id} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            {selected && (
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {selected.category}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  Edit templates in <b>Settings → WhatsApp templates</b>.
                </span>
              </div>
            )}
          </div>

          {unfilledPlaceholders.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground">
                Fill remaining placeholders:
              </div>
              {unfilledPlaceholders.map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{k}</Label>
                  <input
                    className="w-full border rounded-md h-8 px-2 bg-background text-sm"
                    value={extraVars[k] ?? ''}
                    onChange={(e) =>
                      setExtraVars((v) => ({ ...v, [k]: e.target.value }))
                    }
                    placeholder={`Value for {{${k}}}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <Label>Message (editable)</Label>
            <Textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Sending to {tenant.phone ?? <em>no phone on file</em>}.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={!url || !message.trim()}>
            <Send className="size-4 mr-1" /> Send via WhatsApp
            <ExternalLink className="size-3 ml-1 opacity-70" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

