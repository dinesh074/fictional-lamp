import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import { formatDate, formatINR } from '@/lib/format';

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('invoices')
    .select('*, payment:payments(*, tenant:tenants(name, phone))')
    .order('created_at', { ascending: false });

  const invoices = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <p className="text-sm text-muted-foreground">Generated invoices for payments.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>All invoices ({invoices.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead><TableHead>Tenant</TableHead>
                <TableHead>Amount</TableHead><TableHead>Created</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">
                  No invoices yet. Generate one from the Payments page.
                </TableCell></TableRow>
              )}
              {invoices.map(inv => {
                const payment = Array.isArray(inv.payment) ? inv.payment[0] : inv.payment;
                const tenant = payment?.tenant && (Array.isArray(payment.tenant) ? payment.tenant[0] : payment.tenant);
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono">{inv.invoice_number}</TableCell>
                    <TableCell>{tenant?.name ?? '-'}</TableCell>
                    <TableCell>{formatINR(payment?.amount ?? 0)}</TableCell>
                    <TableCell>{formatDate(inv.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/dashboard/invoices/${inv.id}`}
                        className={buttonVariants({ size: 'sm', variant: 'outline' })}
                      >View</Link>
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
