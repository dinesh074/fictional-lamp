'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate, toISODate } from '@/lib/format';
import type { DateRange } from 'react-day-picker';

export function DateRangePicker({ defaultRange }: { defaultRange?: DateRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const fromParam = search.get('from');
  const toParam = search.get('to');
  const initial: DateRange | undefined =
    fromParam && toParam
      ? { from: new Date(fromParam), to: new Date(toParam) }
      : defaultRange;

  const [range, setRange] = useState<DateRange | undefined>(initial);

  function apply(next: DateRange | undefined) {
    setRange(next);
    const params = new URLSearchParams(search.toString());
    if (next?.from) params.set('from', toISODate(next.from)); else params.delete('from');
    if (next?.to)   params.set('to',   toISODate(next.to));   else params.delete('to');
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    apply(undefined);
  }

  const label = range?.from
    ? range.to
      ? `${formatDate(range.from)} – ${formatDate(range.to)}`
      : formatDate(range.from)
    : 'Pick a date range';

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger
          className={buttonVariants({ variant: 'outline' }) + ' justify-start text-left font-normal min-w-[240px]'}
        >
          <CalendarIcon className="mr-2 size-4" />
          {label}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            onSelect={apply}
            numberOfMonths={2}
            defaultMonth={range?.from}
          />
        </PopoverContent>
      </Popover>
      {(range?.from || range?.to) && (
        <Button variant="ghost" size="sm" onClick={clear}>Clear</Button>
      )}
    </div>
  );
}
