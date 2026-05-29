export interface UpiLinkInput {
  pa: string;            // payee VPA (UPI id)
  pn?: string;           // payee name
  am?: number | string;  // amount
  tn?: string;           // transaction note
  cu?: string;           // currency, defaults INR
}

/** Build a `upi://pay?...` deep link. */
export function upiLink({ pa, pn, am, tn, cu = 'INR' }: UpiLinkInput): string | null {
  if (!pa) return null;
  const params = new URLSearchParams();
  params.set('pa', pa);
  if (pn) params.set('pn', pn);
  if (am !== undefined && am !== null && am !== '') params.set('am', String(am));
  if (tn) params.set('tn', tn);
  params.set('cu', cu);
  return `upi://pay?${params.toString()}`;
}

