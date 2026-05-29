'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, MessageCircle, ArrowLeft, FileText, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatINR, formatMonth, waLink } from '@/lib/format';
import { InvoiceDoc, PDFDownloadLink, type InvoiceData } from './invoice-pdf';

const STATUS_THEME: Record<string, { bg: string; text: string; ring: string; Icon: typeof CheckCircle2; label: string }> = {
  paid:    { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-300', Icon: CheckCircle2, label: 'PAID' },
  pending: { bg: 'bg-amber-100',   text: 'text-amber-700',   ring: 'ring-amber-300',   Icon: Clock,        label: 'PENDING' },
  overdue: { bg: 'bg-rose-100',    text: 'text-rose-700',    ring: 'ring-rose-300',    Icon: AlertTriangle,label: 'OVERDUE' },
};

export function InvoiceView(props: InvoiceData) {
  const { invoice, payment, tenant, settings } = props;
  const filename = `${invoice.invoice_number}.pdf`;
  const msg =
    `Hi ${tenant.name}, here is your invoice ${invoice.invoice_number} from ${settings.hostel_name} ` +
    `for ${formatMonth(payment.period_month)}: ${formatINR(payment.amount)} (${payment.status}). ` +
    `Due: ${formatDate(payment.due_date)}.`;

  const theme = STATUS_THEME[payment.status] ?? STATUS_THEME.pending;
  const StatusIcon = theme.Icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/invoices" className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft className="size-4 mr-1" />Back
        </Link>
        <div className="flex gap-2">
          <PDFDownloadLink document={<InvoiceDoc {...props} />} fileName={filename}>
            {/* react-pdf children prop is typed loosely */}
            {(({ loading }: { loading: boolean }) => (
              <Button variant="default" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                <Download className="size-4 mr-1" />{loading ? 'Preparing…' : 'Download PDF'}
              </Button>
            )) as unknown as React.ReactNode}
          </PDFDownloadLink>
          {tenant.phone && (
            <a
              className={buttonVariants({ variant: 'outline' }) + ' border-green-500 text-green-700 hover:bg-green-50'}
              target="_blank"
              rel="noreferrer"
              href={waLink(tenant.phone, msg)}
            >
              <MessageCircle className="size-4 mr-1 text-green-600" />Share on WhatsApp
            </a>
          )}
        </div>
      </div>

      <Card className="overflow-hidden border-t-4 border-t-indigo-500 shadow-lg">
        {/* Gradient header */}
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-white/80">
                <FileText className="size-4" />Invoice
              </div>
              <div className="font-mono text-3xl font-bold mt-1">#{invoice.invoice_number}</div>
              <div className="text-sm text-white/90 mt-1">
                For {formatMonth(payment.period_month)} · {settings.hostel_name}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ring-2 ${theme.bg} ${theme.text} ${theme.ring}`}>
                <StatusIcon className="size-3.5" />{theme.label}
              </div>
              <div className="text-right">
                <div className="text-xs text-white/80 uppercase tracking-wider">Total</div>
                <div className="text-3xl font-extrabold">{formatINR(payment.amount)}</div>
              </div>
              <div className="text-xs text-white/80">Due {formatDate(payment.due_date)}</div>
            </div>
          </div>
        </div>

        <CardContent className="grid md:grid-cols-2 gap-6 p-6">
          <div className="rounded-lg border-l-4 border-l-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-2">From</div>
            <div className="text-sm space-y-0.5">
              <div className="font-semibold text-base">{settings.hostel_name}</div>
              {settings.hostel_address && <div>{settings.hostel_address}</div>}
              {settings.hostel_phone && <div>Phone: {settings.hostel_phone}</div>}
              {settings.hostel_email && <div>Email: {settings.hostel_email}</div>}
              {settings.hostel_gst && <div>GSTIN: {settings.hostel_gst}</div>}
              {settings.hostel_pan && <div>PAN: {settings.hostel_pan}</div>}
            </div>
          </div>
          <div className="rounded-lg border-l-4 border-l-pink-400 bg-pink-50/40 dark:bg-pink-950/20 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-pink-700 dark:text-pink-300 mb-2">Billed to</div>
            <div className="text-sm space-y-0.5">
              <div className="font-semibold text-base">{tenant.name}</div>
              {tenant.phone && <div>Phone: {tenant.phone}</div>}
              {tenant.email && <div>Email: {tenant.email}</div>}
              {tenant.pan && <div>PAN: {tenant.pan}</div>}
              {tenant.gst_number && <div>GSTIN: {tenant.gst_number}</div>}
              {tenant.room && <div>Room: {tenant.room.building?.name} / {tenant.room.room_number}</div>}
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Charges</div>
            <div className="border rounded-lg overflow-hidden shadow-sm">
              <div className="grid grid-cols-[1fr_auto] bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 px-4 py-2.5 text-sm font-semibold">
                <div>Description</div><div>Amount</div>
              </div>
              <div className="grid grid-cols-[1fr_auto] px-4 py-3 text-sm border-t">
                <div>Rent for {formatMonth(payment.period_month)}</div>
                <div className="font-medium">{formatINR(payment.amount)}</div>
              </div>
              <div className="grid grid-cols-[1fr_auto] px-4 py-3 text-lg font-bold border-t bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40">
                <div>Total</div>
                <div className="text-indigo-700 dark:text-indigo-300">{formatINR(payment.amount)}</div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 text-sm space-y-1 bg-muted/30 rounded-lg p-4">
            <div>Status: <span className={`font-bold uppercase ${theme.text}`}>{payment.status}</span></div>
            <div>Due date: <span className="font-medium">{formatDate(payment.due_date)}</span></div>
            {payment.paid_date && (
              <div>Paid on: <span className="font-medium">{formatDate(payment.paid_date)}</span> ({payment.payment_mode})</div>
            )}
            {payment.notes && <div>Notes: {payment.notes}</div>}
            {settings.upi_vpa && payment.status !== 'paid' && (
              <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                Pay via UPI: <span className="font-mono text-foreground">{settings.upi_vpa}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
