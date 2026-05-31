export interface UpiLinkInput {
  pa: string;            // payee VPA (UPI id)
  pn?: string;           // payee name
  am?: number | string;  // amount (rupees)
  tn?: string;           // transaction note
  cu?: string;           // currency, defaults INR
}

/**
 * RFC 3986 percent-encoding for UPI intent params.
 *
 * `URLSearchParams` encodes spaces as `+`, which several PSP apps
 * (PhonePe / Paytm / older BHIM) misrender inside the txn note and a few
 * even refuse the intent. UPI spec wants `%20` for spaces, so we hand-roll
 * the encoding using `encodeURIComponent`.
 */
function enc(v: string): string {
  return encodeURIComponent(v).replace(/'/g, '%27');
}

/** Format amount per UPI spec: decimal string with exactly 2 decimals. */
function formatAmount(am: number | string): string | null {
  const n = typeof am === 'number' ? am : Number(am);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/** Build a `upi://pay?...` deep link. */
export function upiLink({ pa, pn, am, tn, cu = 'INR' }: UpiLinkInput): string | null {
  if (!pa) return null;
  const parts: string[] = [`pa=${enc(pa)}`];
  if (pn) parts.push(`pn=${enc(pn)}`);
  if (am !== undefined && am !== null && am !== '') {
    const amt = formatAmount(am);
    if (amt) parts.push(`am=${amt}`); // numeric — no encoding needed
  }
  if (tn) {
    // UPI spec caps note at ~50 chars; trim defensively to avoid truncation by apps.
    parts.push(`tn=${enc(tn.slice(0, 50))}`);
  }
  parts.push(`cu=${enc(cu)}`);
  return `upi://pay?${parts.join('&')}`;
}

