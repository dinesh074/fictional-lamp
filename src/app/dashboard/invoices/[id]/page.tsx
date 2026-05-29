import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { InvoiceView } from './invoice-view';
import type { Invoice, Payment, Settings, Tenant } from '@/lib/types';

export default async function InvoiceDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, payment:payments(*, tenant:tenants(*, room:rooms(*, building:buildings(*))))')
    .eq('id', id)
    .single();

  const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
  if (!invoice || !settings) notFound();

  const payment = (Array.isArray(invoice.payment) ? invoice.payment[0] : invoice.payment) as Payment & { tenant: Tenant };
  if (!payment) notFound();
  const tenant = (Array.isArray(payment.tenant) ? payment.tenant[0] : payment.tenant) as Tenant;
  if (!tenant) notFound();

  const inv = { ...invoice, payment: undefined } as unknown as Invoice;

  return (
    <InvoiceView
      invoice={inv}
      payment={payment}
      tenant={tenant}
      settings={settings as Settings}
    />
  );
}

