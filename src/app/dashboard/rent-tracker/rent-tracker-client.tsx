'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  startOfMonth, addMonths, format, parseISO, differenceInCalendarDays,
  getDaysInMonth,
} from 'date-fns';
import {
  Check, X, Minus, MessageCircle, Download, CalendarClock, Building2, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WaMessageDialog } from '@/components/wa-message-dialog';
import { OverdueWaDialog, type OverdueRow } from '@/components/overdue-wa-dialog';
import { downloadCSV, formatINR, formatMonth, toISODate } from '@/lib/format';
import type { Building, Payment, Role, Settings, Tenant } from '@/lib/types';

type DotStatus = 'paid' | 'missed' | 'upcoming' | 'placeholder' | 'before';

interface Dot {
  month: string;            // yyyy-MM-01
  status: DotStatus;
  payment?: Payment;
  dueDate?: string | null;
  paidDate?: string | null;
  daysToDue?: number;
  /** True when no row exists but we assume "paid" because data is bootstrapping. */
  assumed?: boolean;
}

interface TenantRow {
  tenant: Tenant;
  monthlyRent: number;
  dots: Dot[];
  paidTill: string | null;
  nextDue: { month: string; date: string | null; daysToDue: number | null } | null;
  hasMissed: boolean;
}

interface BuildingGroup {
  buildingId: string | null;
  buildingName: string;
  rows: TenantRow[];
}

const TRACKER_YEAR = 2026;       // fixed window: Jan 2026 → Dec 2026
const DUE_SOON_DAYS = 15;

/** Build a yyyy-MM-dd date string for the same day-of-month as `dayOfMonth`,
 *  clamped to the last day of `monthIso` when shorter (e.g. Feb 30 → Feb 28). */
function dueDateFromDay(monthIso: string, dayOfMonth: number): string {
  const m = parseISO(monthIso);
  const lastDay = getDaysInMonth(m);
  const day = Math.min(dayOfMonth, lastDay);
  return format(new Date(m.getFullYear(), m.getMonth(), day), 'yyyy-MM-dd');
}

export function RentTrackerClient({ role: _role }: { role: Role }) {
  const supabase = createClient();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [waTenant, setWaTenant] = useState<Tenant | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [dueSoonOpen, setDueSoonOpen] = useState(false);

  // Fixed window: Jan-YEAR through Dec-YEAR (12 months, always in order)
  const monthsWindow = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < 12; i++) {
      list.push(format(new Date(TRACKER_YEAR, i, 1), 'yyyy-MM-01'));
    }
    return list;
  }, []);

  async function load() {
    setLoading(true);
    const [t, p, b, s] = await Promise.all([
      supabase
        .from('tenants')
        .select('*, room:rooms(*, building:buildings(*))')
        .order('name'),
      supabase
        .from('payments')
        .select('*')
        .gte('period_month', `${TRACKER_YEAR}-01-01`)
        .lte('period_month', `${TRACKER_YEAR}-12-01`)
        .order('period_month'),
      supabase.from('buildings').select('*').order('name'),
      supabase.from('settings').select('*').eq('id', 1).single(),
    ]);
    if (t.error) toast.error(t.error.message);
    if (p.error) toast.error(p.error.message);
    setTenants((t.data as Tenant[]) ?? []);
    setPayments((p.data as Payment[]) ?? []);
    setBuildings((b.data as Building[]) ?? []);
    setSettings((s.data as Settings) ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Per-tenant rent dots (12, chronologically Jan→Dec)
  const rows: TenantRow[] = useMemo(() => {
    const today = new Date();
    const currentMonth = startOfMonth(today);
    const settingsDueDay = settings?.payment_due_day ?? 5;

    const byTenant = new Map<string, Payment[]>();
    for (const p of payments) {
      if (!byTenant.has(p.tenant_id)) byTenant.set(p.tenant_id, []);
      byTenant.get(p.tenant_id)!.push(p);
    }

    return tenants.map((t) => {
      const tPayments = byTenant.get(t.id) ?? [];
      const checkIn = t.check_in_date ? parseISO(t.check_in_date) : null;
      const checkInMonth = checkIn ? startOfMonth(checkIn) : null;
      // Tenant-specific due day (fall back to settings default)
      const dueDay =
        t.payment_due_day ?? (checkIn ? checkIn.getDate() : settingsDueDay);

      const dots: Dot[] = monthsWindow.map((monthIso) => {
        const monthDate = parseISO(monthIso);

        if (checkInMonth && monthDate.getTime() < checkInMonth.getTime()) {
          return { month: monthIso, status: 'before' };
        }
        const isFuture = monthDate.getTime() > currentMonth.getTime();
        // Prefer a paid row when duplicates exist for the same tenant+month.
        // Otherwise a stale 'pending' row from before the payments-page
        // upsert fix could shadow a freshly-recorded 'paid' row and leave
        // the tracker cell red / the "Paid till" line stuck on an old month.
        const monthRows = tPayments.filter(
          (p) => p.period_month.slice(0, 10) === monthIso,
        );
        const payment =
          monthRows.find((p) => p.status === 'paid') ?? monthRows[0];

        if (payment) {
          if (payment.status === 'paid') {
            return {
              month: monthIso,
              status: 'paid',
              payment,
              dueDate: payment.due_date,
              paidDate: payment.paid_date,
            };
          }
          const due = payment.due_date ? parseISO(payment.due_date) : null;
          const daysToDue = due ? differenceInCalendarDays(due, today) : null;
          const isOverdue =
            payment.status === 'overdue' ||
            (daysToDue !== null && daysToDue < 0);
          return {
            month: monthIso,
            status: isOverdue ? 'missed' : 'upcoming',
            payment,
            dueDate: payment.due_date,
            daysToDue: daysToDue ?? undefined,
          };
        }

        if (isFuture) {
          // Future month with no record → upcoming, with synthetic due date
          // (= tenant's day-of-month for that month).
          const due = dueDateFromDay(monthIso, dueDay);
          const daysToDue = differenceInCalendarDays(parseISO(due), today);
          return {
            month: monthIso,
            status: 'upcoming',
            dueDate: due,
            daysToDue,
          };
        }

        // Past / current month with no payment row → assume PAID
        // (bootstrap default: until an explicit unpaid row exists).
        return { month: monthIso, status: 'paid', assumed: true };
      });

      // Paid till = latest contiguous 'paid' from check-in onward
      let paidTill: string | null = null;
      for (const d of dots) {
        if (d.status === 'before') continue;
        if (d.status === 'paid') paidTill = d.month;
        else break;
      }
      const firstUnpaid = dots.find(
        (d) => d.status === 'missed' || d.status === 'upcoming',
      );
      const nextDue = firstUnpaid
        ? {
            month: firstUnpaid.month,
            date: firstUnpaid.dueDate ?? null,
            daysToDue: firstUnpaid.daysToDue ?? null,
          }
        : null;
      const hasMissed = dots.some((d) => d.status === 'missed');

      return {
        tenant: t,
        monthlyRent: t.room?.monthly_rent ?? 0,
        dots,
        paidTill,
        nextDue,
        hasMissed,
      };
    });
  }, [tenants, payments, monthsWindow, settings]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.tenant.status !== 'active') return false;
      if (buildingFilter !== 'all') {
        if (buildingFilter === 'unassigned') {
          if (r.tenant.room?.building?.id) return false;
        } else if (r.tenant.room?.building?.id !== buildingFilter) return false;
      }
      const dueSoon =
        r.nextDue?.daysToDue !== null &&
        r.nextDue?.daysToDue !== undefined &&
        r.nextDue.daysToDue >= 0 &&
        r.nextDue.daysToDue <= DUE_SOON_DAYS;
      if (statusFilter === 'uptodate') {
        if (r.hasMissed || dueSoon) return false;
      }
      if (statusFilter === 'duesoon' && !dueSoon) return false;
      if (statusFilter === 'missed' && !r.hasMissed) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          r.tenant.name.toLowerCase().includes(q) ||
          (r.tenant.phone ?? '').includes(q) ||
          (r.tenant.room?.room_number ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rows, buildingFilter, statusFilter, search]);

  const grouped: BuildingGroup[] = useMemo(() => {
    const map = new Map<string, BuildingGroup>();
    for (const r of filtered) {
      const bid = r.tenant.room?.building?.id ?? 'unassigned';
      const bname = r.tenant.room?.building?.name ?? 'Unassigned';
      if (!map.has(bid)) {
        map.set(bid, {
          buildingId: r.tenant.room?.building?.id ?? null,
          buildingName: bname,
          rows: [],
        });
      }
      map.get(bid)!.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.buildingId === null) return 1;
      if (b.buildingId === null) return -1;
      return a.buildingName.localeCompare(b.buildingName);
    });
  }, [filtered]);

  const summary = useMemo(() => {
    let upToDate = 0, dueSoon = 0, missed = 0, outstanding = 0;
    for (const r of filtered) {
      if (r.hasMissed) missed += 1;
      else if (r.nextDue) {
        const d = r.nextDue.daysToDue;
        if (d !== null && d >= 0 && d <= DUE_SOON_DAYS) dueSoon += 1;
        else upToDate += 1;
      } else upToDate += 1;

      for (const dot of r.dots) {
        if ((dot.status === 'missed' || dot.status === 'upcoming') && dot.payment) {
          outstanding += Number(dot.payment.amount);
        }
      }
    }
    return { upToDate, dueSoon, missed, outstanding, total: filtered.length };
  }, [filtered]);

  // Bulk-notify queue: oldest missed period for every overdue tenant.
  const overdueItems = useMemo<OverdueRow[]>(() => {
    const today = new Date();
    const rowsOut: OverdueRow[] = [];
    for (const r of filtered) {
      if (!r.hasMissed) continue;
      const missedDot = r.dots.find((d) => d.status === 'missed' && d.payment);
      if (!missedDot?.payment) continue;
      const p = missedDot.payment;
      const due = p.due_date ? new Date(p.due_date) : null;
      const daysLate = due
        ? Math.max(0, Math.ceil((today.getTime() - due.getTime()) / 86_400_000))
        : 0;
      rowsOut.push({
        tenant: r.tenant,
        payment: {
          amount: Number(p.amount ?? 0),
          period_month: p.period_month,
          due_date: p.due_date ?? null,
          status: (p.status ?? 'overdue') as 'paid' | 'pending' | 'overdue',
        },
        daysLate,
      });
    }
    return rowsOut.sort((a, b) => b.daysLate - a.daysLate);
  }, [filtered]);

  // Tenants whose next unpaid period is due within DUE_SOON_DAYS (and not
  // already overdue). Builds a payment row from either the existing dot or
  // the synthesized future "upcoming" dot from the rent-tracker dot strip.
  const dueSoonItems = useMemo<OverdueRow[]>(() => {
    const rowsOut: OverdueRow[] = [];
    for (const r of filtered) {
      if (r.hasMissed) continue;
      const next = r.dots.find((d) => d.status === 'upcoming');
      if (!next) continue;
      const days = next.daysToDue;
      if (days === undefined || days < 0 || days > DUE_SOON_DAYS) continue;
      rowsOut.push({
        tenant: r.tenant,
        payment: {
          amount: Number(next.payment?.amount ?? r.monthlyRent ?? 0),
          period_month: next.month,
          due_date: next.dueDate ?? null,
          status: (next.payment?.status ?? 'pending') as 'paid' | 'pending' | 'overdue',
        },
        daysLate: days,
      });
    }
    return rowsOut.sort((a, b) => a.daysLate - b.daysLate);
  }, [filtered]);

  function exportCSV() {
    const rowsCsv = filtered.map((r) => ({
      Name: r.tenant.name,
      Phone: r.tenant.phone ?? '',
      Building: r.tenant.room?.building?.name ?? '',
      Room: r.tenant.room?.room_number ?? '',
      'Check-in': r.tenant.check_in_date ?? '',
      'Monthly rent': r.monthlyRent,
      'Paid till': r.paidTill ? formatMonth(r.paidTill) : '—',
      'Next due': r.nextDue?.date ?? '—',
      Status: r.hasMissed ? 'Missed' : r.nextDue ? 'Due' : 'Up to date',
    }));
    if (rowsCsv.length === 0) return toast.error('Nothing to export');
    downloadCSV(rowsCsv, `rent-tracker-${toISODate(new Date())}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rent tracker</h1>
          <p className="text-sm text-muted-foreground">
            {TRACKER_YEAR} timeline — Jan&nbsp;→&nbsp;Dec. Next-due date for each
            tenant uses their check-in day-of-month.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setOverdueOpen(true)}
            className={
              overdueItems.length > 0
                ? 'border-red-600/40 text-red-700 hover:bg-red-50 hover:text-red-800'
                : ''
            }
            title={
              overdueItems.length === 0
                ? 'No overdue tenants right now — click to confirm / inspect'
                : `Open WhatsApp reminders for ${overdueItems.length} overdue tenant(s)`
            }
          >
            <Send className="size-4 mr-1" />
            Notify overdue
            <Badge
              variant={overdueItems.length > 0 ? 'destructive' : 'secondary'}
              className={`ml-1.5 h-5 px-1.5 text-[10px] ${
                overdueItems.length > 0 ? 'animate-pulse' : ''
              }`}
            >
              {overdueItems.length}
            </Badge>
          </Button>
          <Button
            variant="outline"
            onClick={() => setDueSoonOpen(true)}
            className={
              dueSoonItems.length > 0
                ? 'border-amber-600/40 text-amber-700 hover:bg-amber-50 hover:text-amber-800'
                : ''
            }
            title={
              dueSoonItems.length === 0
                ? `No tenants due in the next ${DUE_SOON_DAYS} days`
                : `Open WhatsApp reminders for ${dueSoonItems.length} tenant(s) due soon`
            }
          >
            <Send className="size-4 mr-1" />
            Notify due-soon
            <Badge
              variant="secondary"
              className={`ml-1.5 h-5 px-1.5 text-[10px] ${
                dueSoonItems.length > 0 ? 'bg-amber-600 text-white' : ''
              }`}
            >
              {dueSoonItems.length}
            </Badge>
          </Button>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="Up to date" value={summary.upToDate} color="emerald" />
        <SummaryTile label="Outstanding" value={formatINR(summary.outstanding)} color="violet" />
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <CardTitle>Tenants ({filtered.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search name, phone, room…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56"
            />
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
            >
              <option value="all">All buildings</option>
              <option value="unassigned">Unassigned</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All status</option>
              <option value="uptodate">Up to date</option>
              <option value="duesoon">Due soon</option>
              <option value="missed">Missed</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No tenants match.</p>
          ) : (
            <>
              {/* Legend + month header (so dots align with months) */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                <Legend className="bg-emerald-700 ring-2 ring-emerald-900 text-white" label="Paid" icon={<Check className="size-3" strokeWidth={4} />} />
                <Legend className="bg-amber-500 ring-2 ring-amber-800 text-white" label="Due soon" icon={<Minus className="size-3" strokeWidth={4} />} />
                <Legend className="bg-red-700 ring-2 ring-red-900 text-white" label="Missed" icon={<X className="size-3" strokeWidth={4} />} />
                <Legend className="bg-sky-500 ring-2 ring-sky-800 text-white" label="Upcoming" icon={<Minus className="size-3" strokeWidth={4} />} />
                <Legend className="bg-slate-200 ring-2 ring-slate-400 text-slate-500" label="Before join" icon={<Minus className="size-3" />} />
              </div>

              <div className="overflow-x-auto">
                {/* Month header — three columns: tenant | centered months | right-aligned status */}
                <div className="flex items-center gap-2 pb-2 border-b mb-2 min-w-[720px]">
                  <div className="w-52 shrink-0 text-[10px] font-medium uppercase text-muted-foreground">
                    Tenant
                  </div>
                  <div className="flex-1 flex items-center justify-center gap-1.5">
                    {monthsWindow.map((m) => (
                      <div
                        key={m}
                        className="size-6 shrink-0 flex items-center justify-center text-[10px] font-semibold text-muted-foreground"
                        title={format(parseISO(m), 'MMM yyyy')}
                      >
                        {format(parseISO(m), 'MMM').charAt(0)}
                      </div>
                    ))}
                  </div>
                  <div className="w-[230px] shrink-0 text-right text-[10px] font-medium uppercase text-muted-foreground">
                    Status
                  </div>
                </div>

                <div className="space-y-6">
                  {grouped.map((g) => (
                    <div key={g.buildingId ?? 'unassigned'} className="space-y-2">
                      <div className="flex items-center gap-2 border-b pb-1">
                        <Building2 className="size-4 text-muted-foreground" />
                        <h3 className="font-semibold text-base">{g.buildingName}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {g.rows.length} tenant{g.rows.length === 1 ? '' : 's'}
                        </Badge>
                      </div>
                      <ul className="divide-y">
                        {g.rows.map((r) => (
                          <li
                            key={r.tenant.id}
                            className="py-2 flex items-center gap-2 min-w-[720px]"
                          >
                            {/* Left: tenant info */}
                            <div className="w-52 min-w-0 shrink-0">
                              <div className="font-medium truncate text-sm">{r.tenant.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {r.tenant.room?.room_number
                                  ? `Room ${r.tenant.room.room_number}`
                                  : 'Unassigned room'}
                                {r.monthlyRent > 0 && ` · ${formatINR(r.monthlyRent)}/mo`}
                              </div>
                            </div>

                            {/* Middle: 12 month dots, perfectly centered (aligns with header) */}
                            <div className="flex-1 flex items-center justify-center gap-1.5">
                              {r.dots.map((d, i) => (
                                <DotIcon key={`${d.month}-${i}`} dot={d} />
                              ))}
                            </div>

                            {/* Right: status text + WhatsApp button, pinned to the right edge */}
                            <div className="w-[230px] shrink-0 flex items-center justify-end gap-2">
                              <div className="text-xs whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-emerald-600 text-white ring-1 ring-emerald-900/40">
                                    <Check className="size-2.5" strokeWidth={4} />
                                  </span>
                                  <span className="text-muted-foreground">till</span>
                                  <span className="font-semibold text-emerald-700">
                                    {r.paidTill ? formatMonth(r.paidTill) : '—'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                  <CalendarClock className="size-3" />
                                  <NextDueText next={r.nextDue} hasMissed={r.hasMissed} />
                                </div>
                              </div>
                              {r.tenant.phone ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 rounded-full hover:bg-green-50 shrink-0"
                                  title="WhatsApp reminder"
                                  onClick={() => setWaTenant(r.tenant)}
                                >
                                  <MessageCircle className="size-4 text-green-600" />
                                </Button>
                              ) : (
                                <span className="size-8 shrink-0" aria-hidden />
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {waTenant && (
        <WaMessageDialog
          open={waTenant !== null}
          onOpenChange={(v) => { if (!v) setWaTenant(null); }}
          tenant={waTenant}
          settings={settings}
        />
      )}

      <OverdueWaDialog
        open={overdueOpen}
        onOpenChange={setOverdueOpen}
        items={overdueItems}
        settings={settings}
      />

      <OverdueWaDialog
        mode="duesoon"
        open={dueSoonOpen}
        onOpenChange={setDueSoonOpen}
        items={dueSoonItems}
        settings={settings}
      />
    </div>
  );
}

// ------------------------------------------------------------------

function DotIcon({ dot }: { dot: Dot }) {
  const monthLbl = format(parseISO(dot.month), 'MMM yyyy');

  // Inline-style palette so colours always render, independent of Tailwind JIT scanning.
  const PAL = {
    paid:     { bg: '#047857', ring: '#064e3b', fg: '#ffffff' },
    missed:   { bg: '#b91c1c', ring: '#7f1d1d', fg: '#ffffff' },
    duesoon:  { bg: '#f59e0b', ring: '#92400e', fg: '#ffffff' },
    upcoming: { bg: '#0ea5e9', ring: '#075985', fg: '#ffffff' },
    before:   { bg: '#e2e8f0', ring: '#94a3b8', fg: '#64748b' },
  } as const;

  const dotStyle = (p: { bg: string; ring: string; fg: string }) => ({
    width: 24,
    height: 24,
    backgroundColor: p.bg,
    boxShadow: `0 0 0 2px ${p.ring}`,
    color: p.fg,
  });

  if (dot.status === 'paid') {
    return (
      <span
        title={
          dot.assumed
            ? `${monthLbl}: paid (assumed)`
            : `${monthLbl}: paid${dot.paidDate ? ` on ${dot.paidDate}` : ''}`
        }
        className="inline-flex shrink-0 items-center justify-center rounded-full"
        style={dotStyle(PAL.paid)}
      >
        <Check size={14} strokeWidth={4} />
      </span>
    );
  }
  if (dot.status === 'missed') {
    return (
      <span
        title={`${monthLbl}: missed (due ${dot.dueDate ?? '—'})`}
        className="inline-flex shrink-0 items-center justify-center rounded-full animate-pulse"
        style={dotStyle(PAL.missed)}
      >
        <X size={14} strokeWidth={4} />
      </span>
    );
  }
  if (dot.status === 'upcoming') {
    const days = dot.daysToDue ?? 99;
    const dueSoon = days <= DUE_SOON_DAYS;
    const tip = `${monthLbl}: due ${dot.dueDate ?? '—'}${
      dot.daysToDue !== undefined ? ` (in ${days}d)` : ''
    }`;
    return (
      <span
        title={tip}
        className="inline-flex shrink-0 items-center justify-center rounded-full"
        style={dotStyle(dueSoon ? PAL.duesoon : PAL.upcoming)}
      >
        <Minus size={14} strokeWidth={4} />
      </span>
    );
  }
  if (dot.status === 'before') {
    return (
      <span
        title={`${monthLbl}: before check-in`}
        className="inline-flex shrink-0 items-center justify-center rounded-full"
        style={dotStyle(PAL.before)}
      >
        <Minus size={12} strokeWidth={3} />
      </span>
    );
  }
  // placeholder
  return (
    <span
      title={monthLbl}
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={dotStyle(PAL.before)}
    >
      <Minus size={12} />
    </span>
  );
}

function NextDueText({
  next, hasMissed,
}: { next: TenantRow['nextDue']; hasMissed: boolean }) {
  if (!next) {
    return <Badge className="ml-1 text-[10px] bg-emerald-600 ring-2 ring-emerald-900/40">All clear</Badge>;
  }
  const days = next.daysToDue;
  const dateLbl = next.date ? format(parseISO(next.date), 'd MMM') : formatMonth(next.month);

  if (hasMissed) {
    return <span className="font-medium text-red-600">due {dateLbl} (missed)</span>;
  }
  if (days === null || days === undefined) {
    return <span className="font-medium">due {dateLbl}</span>;
  }
  if (days < 0) {
    return <span className="font-medium text-red-600">due {dateLbl} ({Math.abs(days)}d late)</span>;
  }
  if (days <= DUE_SOON_DAYS) {
    return <span className="font-medium text-amber-600">due {dateLbl} (in {days}d)</span>;
  }
  return <span className="font-medium">due {dateLbl}</span>;
}

function SummaryTile({
  label, value, color, onClick,
}: {
  label: string;
  value: React.ReactNode;
  color: 'blue' | 'amber' | 'red' | 'violet' | 'emerald';
  onClick?: () => void;
}) {
  const ring = {
    blue: 'border-blue-500/40',
    amber: 'border-amber-500/40',
    red: 'border-red-500/40',
    violet: 'border-violet-500/40',
    emerald: 'border-emerald-500/40',
  }[color];
  const text = {
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    violet: 'text-violet-600',
    emerald: 'text-emerald-600',
  }[color];
  const clickable = !!onClick;
  return (
    <Card
      className={`border-l-4 ${ring} ${
        clickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? 'Click to send WhatsApp reminders' : undefined}
    >
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {clickable && <Send className="size-3 opacity-60" />}
        </div>
        <div className={`text-2xl font-bold mt-1 ${text}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Legend({
  className, label, icon,
}: { className: string; label: string; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex size-4 items-center justify-center rounded-full ${className}`}>
        {icon}
      </span>
      {label}
    </span>
  );
}

