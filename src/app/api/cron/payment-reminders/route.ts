import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderTemplate, waMeUrl } from '@/lib/wa';
import { upiLink } from '@/lib/upi';
import { tenantOnHold } from '@/lib/dues';

export const runtime = 'nodejs';

/**
 * Daily cron endpoint. Returns the wa.me URLs + rendered messages that should
 * be sent today for pending/overdue rent. Since we use wa.me (free), this
 * endpoint does NOT push anything itself — a small client (or webhook) can
 * iterate the returned URLs and open them. Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  try {
    await supabase.rpc('mark_overdue_payments');
  } catch {
    // ignore – best-effort overdue marking
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: payments, error } = await supabase
    .from('payments')
    .select('*, tenant:tenants(*, room:rooms(*, building:buildings(*)))')
    .neq('status', 'paid')
    .lte('due_date', today);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();

  const out: Array<{ tenant_id: string; phone: string; url: string; message: string; status: string }> = [];
  let skipped = 0;
  for (const p of payments ?? []) {
    const t = (p as {
      tenant?: {
        id: string;
        name: string;
        phone: string | null;
        payment_hold: boolean;
        payment_hold_until: string | null;
      };
    }).tenant;
    if (!t?.phone) { skipped++; continue; }
    if (tenantOnHold(t)) { skipped++; continue; }

    const upi = settings?.upi_vpa
      ? upiLink({
          pa: settings.upi_vpa,
          pn: settings.upi_payee_name ?? settings.hostel_name,
          am: p.amount,
          tn: 'Rent',
        })
      : null;
    const tpl = p.status === 'overdue' ? 'payment_overdue' : 'payment_due';
    const message = renderTemplate(tpl, { tenant: t, settings, payment: p, upiLink: upi });
    const url = waMeUrl(t.phone, message);
    if (!url) { skipped++; continue; }
    out.push({ tenant_id: t.id, phone: t.phone, url, message, status: p.status });
    await supabase.from('notifications_log').insert({
      tenant_id: t.id,
      channel: 'whatsapp',
      template: tpl,
      message,
      status: 'queued',
    });
  }

  return NextResponse.json({ generated: out.length, skipped, items: out });
}

