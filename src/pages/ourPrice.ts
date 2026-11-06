/**
 * The price a market price is compared against.
 *
 * The Market Prices page showed the MRP from Product Master. The price the shop
 * actually quotes is the one set on the Specifications tab, so that is used when
 * there is one; the MRP is only the fallback for a product nobody has priced
 * there yet, and is marked as such so the two are never confused.
 */
export interface Priced { specPrice?: number | null; ourPrice?: number | null }

export function ourPriceOf(it: Priced): { value: number | null; isMrp: boolean } {
  if (it.specPrice != null && it.specPrice > 0) return { value: it.specPrice, isMrp: false };
  return { value: it.ourPrice != null && it.ourPrice > 0 ? it.ourPrice : null, isMrp: true };
}
