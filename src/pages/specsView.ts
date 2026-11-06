/**
 * What the Specifications sheet shows after the brand and price filters.
 *
 * Kept apart from the page so the screen and the A4 print are built from the
 * very same list — a printout must match what is on screen.
 */
export type PriceSort = '' | 'asc';

interface Priced { brand: string; model: string; price: number }

/** Brands present in the sheet, in first-seen order, with how many items each has. */
export function brandCounts<T extends Priced>(rows: T[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.brand, (m.get(r.brand) ?? 0) + 1);
  return [...m.entries()];
}

/**
 * Rows grouped by brand. `brand` limits it to one brand ('' means all).
 * With priceSort 'asc' each brand's items run from the lowest price to the
 * highest — the brands themselves keep their order. An item with no price set
 * (0) goes to the end of its brand rather than floating to the top as if it
 * were the cheapest; ties keep their existing order.
 */
export function buildView<T extends Priced>(
  rows: T[],
  opts: { brand: string; priceSort: PriceSort },
): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    if (opts.brand && r.brand !== opts.brand) continue;
    const list = m.get(r.brand);
    if (list) list.push(r); else m.set(r.brand, [r]);
  }
  const groups = [...m.entries()];
  if (opts.priceSort === 'asc') {
    for (const [, list] of groups) {
      const order = new Map(list.map((r, i) => [r, i] as [T, number]));
      list.sort((a, b) => {
        const pa = a.price > 0 ? a.price : Number.POSITIVE_INFINITY;
        const pb = b.price > 0 ? b.price : Number.POSITIVE_INFINITY;
        if (pa === pb) return (order.get(a) ?? 0) - (order.get(b) ?? 0);
        return pa < pb ? -1 : 1;
      });
    }
  }
  return groups;
}
