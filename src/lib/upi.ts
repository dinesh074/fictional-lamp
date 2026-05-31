export interface UpiLinkInput {
  pa: string;            // payee VPA (UPI id)
  pn?: string;           // payee name
  am?: number | string;  // amount (rupees) — IGNORED on purpose, see below
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

/**
 * Build a `upi://pay?...` deep link.
 *
 * NOTE — we intentionally OMIT the `am` (amount) parameter. NPCI / PSPs
 * impose a hard ₹2,000 per-transaction cap for the first 24 h whenever a
 * pre-filled-amount intent is sent to a "new payee" VPA (i.e. one the
 * payer's app hasn't paid before). By leaving the amount blank, the link
 * opens the payee in the UPI app and the tenant types the figure in
 * themselves — which is treated as a regular P2P transfer and uses the
 * payer's normal daily limit (typically ₹1 lakh+). The `am` arg is kept
 * in the input shape so existing call sites keep compiling.
 */
export function upiLink({ pa, pn, tn, cu = 'INR' }: UpiLinkInput): string | null {
  if (!pa) return null;
  const parts: string[] = [`pa=${enc(pa)}`];
  if (pn) parts.push(`pn=${enc(pn)}`);
  if (tn) {
    // UPI spec caps note at ~50 chars; trim defensively to avoid truncation by apps.
    parts.push(`tn=${enc(tn.slice(0, 50))}`);
  }
  parts.push(`cu=${enc(cu)}`);
  return `upi://pay?${parts.join('&')}`;
}

