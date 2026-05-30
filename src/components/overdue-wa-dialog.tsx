'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, MessageCircle, ExternalLink } from 'lucide-react';
import { formatINR, formatMonth } from '@/lib/format';
import { renderTemplate, waMeUrl } from '@/lib/wa';
import { upiLink } from '@/lib/upi';
import type { Settings, Tenant } from '@/lib/types';

export interface OverduePaymentLite {
  amount: number;
  period_month: string;
  due_date: string | null;
  status: 'paid' | 'pending' | 'overdue';
}

export interface OverdueRow {
  tenant: Tenant;
  payment: OverduePaymentLite;
  /** Days late if overdue, OR days-until-due if due soon (always >= 0). */
  daysLate: number;
}

export type OverdueDialogMode = 'overdue' | 'duesoon';

const MODE_COPY: Record<
  OverdueDialogMode,
  {
    title: string;
    template: 'payment_overdue' | 'payment_due';
    accent: string; // tailwind text colour for icon
    sendBtn: string; // tailwind classes for the Send-all CTA
    countColour: string; // header count text colour
    lateLabel: (n: number) => string; // "5d late" or "in 3d"
    lateColour: string;
    emptyMsg: string;
  }
> = {
  overdue: {
    title: 'Notify overdue tenants',
    template: 'payment_overdue',
    accent: 'text-red-600',
    sendBtn: 'bg-red-600 hover:bg-red-600/90 text-white',
    countColour: 'text-red-700',
    lateLabel: (n) => `${n}d late`,
    lateColour: 'text-red-600',
    emptyMsg: 'Nothing overdue — well done!',
  },
  duesoon: {
    title: 'Notify tenants due soon',
    template: 'payment_due',
    accent: 'text-amber-600',
    sendBtn: 'bg-amber-600 hover:bg-amber-600/90 text-white',
    countColour: 'text-amber-700',
    lateLabel: (n) => (n === 0 ? 'due today' : `due in ${n}d`),
    lateColour: 'text-amber-600',
    emptyMsg: 'No upcoming dues — all clear!',
  },
};

export function OverdueWaDialog({
  open,
  onOpenChange,
  items,
  settings,
  mode = 'overdue',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: OverdueRow[];
  settings: Settings | null;
  mode?: OverdueDialogMode;
}) {
  const copy = MODE_COPY[mode];
  const [sent, setSent] = useState<Set<string>>(new Set());

  // Reset the "sent" tick marks every time the dialog re-opens.
  useEffect(() => {
    if (open) setSent(new Set());
  }, [open]);

  const withPhone = items.filter((r) => !!r.tenant.phone);
  const withoutPhone = items.filter((r) => !r.tenant.phone);
  const totalOutstanding = items.reduce(
    (s, r) => s + Number(r.payment.amount ?? 0),
    0,
  );

  function buildMessageFor(row: OverdueRow): { url: string; message: string } | null {
    const link = upiLink({
      pa: settings?.upi_vpa ?? '',
      pn: settings?.hostel_name ?? undefined,
      am: Number(row.payment.amount ?? 0) || undefined,
      tn: `Rent ${formatMonth(row.payment.period_month)} - ${row.tenant.name}`,
    });
    const message = renderTemplate(copy.template, {
      tenant: row.tenant,
      settings,
      payment: {
        amount: row.payment.amount,
        period_month: row.payment.period_month,
        due_date: row.payment.due_date ?? '',
        status: row.payment.status,
      },
      upiLink: link,
    });
    const url = waMeUrl(row.tenant.phone, message);
    return url ? { url, message } : null;
  }

  function openOne(row: OverdueRow) {
    const built = buildMessageFor(row);
    if (!built) {
      toast.error(`${row.tenant.name}: no phone on file`);
      return;
    }
    window.open(built.url, '_blank', 'noopener');
    setSent((s) => new Set(s).add(row.tenant.id));
  }

  function openAll() {
    if (withPhone.length === 0) return toast.error('No tenants with a phone to notify');
    if (
      withPhone.length > 5 &&
      !confirm(
        `This will open ${withPhone.length} WhatsApp tabs back-to-back. ` +
          `Your browser may ask to allow pop-ups. Continue?`,
      )
    )
      return;

    let opened = 0;
    withPhone.forEach((row, i) => {
      const built = buildMessageFor(row);
      if (!built) return;
      setTimeout(() => {
        window.open(built.url, '_blank', 'noopener');
        setSent((s) => new Set(s).add(row.tenant.id));
      }, i * 250);
      opened += 1;
    });
    toast.success(`Queued ${opened} WhatsApp reminder${opened === 1 ? '' : 's'}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className={`size-5 ${copy.accent}`} />
            {copy.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Overdue: </span>
              <span className="font-semibold text-red-700">{items.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">With phone: </span>
              <span className="font-semibold">{withPhone.length}</span>
            </div>
            {withoutPhone.length > 0 && (
              <div>
                <span className="text-muted-foreground">Missing phone: </span>
                <span className="font-semibold text-amber-700">{withoutPhone.length}</span>
              </div>
            )}
            <div className="ml-auto">
              <span className="text-muted-foreground">Outstanding: </span>
              <span className="font-semibold">{formatINR(totalOutstanding)}</span>
            </div>
          </div>

          <div className="border rounded-md max-h-[50vh] overflow-y-auto divide-y">
            {items.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                Nothing overdue — well done!
              </div>
            )}
            {items.map((row) => {
              const isSent = sent.has(row.tenant.id);
              return (
                <div
                  key={row.tenant.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      {row.tenant.name}
                      {isSent && (
                        <Badge
                          className="text-[9px] bg-emerald-600 ring-1 ring-emerald-900/40"
                          title="WhatsApp opened"
                        >
                          ✓ opened
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {row.tenant.room?.building?.name
                        ? `${row.tenant.room.building.name} / `
                        : ''}
                      {row.tenant.room?.room_number ?? 'Unassigned'}
                      {' · '}
                      {formatMonth(row.payment.period_month)}
                      {' · '}
                      {formatINR(row.payment.amount)}
                      {' · '}
                      <span className={`${copy.lateColour} font-medium`}>
                        {copy.lateLabel(row.daysLate)}
                      </span>
                      {!row.tenant.phone && (
                        <span className="text-amber-700"> · no phone</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openOne(row)}
                    disabled={!row.tenant.phone}
                    title={
                      row.tenant.phone
                        ? 'Open WhatsApp for this tenant'
                        : 'No phone on file'
                    }
                  >
                    <MessageCircle className="size-3.5 mr-1 text-green-600" />
                    {isSent ? 'Open again' : 'WhatsApp'}
                    <ExternalLink className="size-3 ml-1 opacity-60" />
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Each reminder opens in a new WhatsApp tab with a pre-filled
            <span className="font-medium"> {copy.template} </span>
            message (you can still tweak before hitting Send). If your browser
            blocks the pop-ups, allow them for this site and try again.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={openAll}
            disabled={withPhone.length === 0}
            className={copy.sendBtn}
          >
            <Send className="size-4 mr-1" />
            Send all ({withPhone.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

