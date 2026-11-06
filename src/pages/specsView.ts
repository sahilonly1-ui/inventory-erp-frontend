/**
 * What the Specifications sheet shows after the brand and price filters.
 *
 * Kept apart from the page so the screen and the A4 print are built from the
 * very same list — a printout must match what is on screen.
 */
export type PriceSort = '' | 'asc';

interface Priced { brand: string; model: string; price: number }

export interface SheetView<T> {
  /** true: rows sit under a header per brand. false: one flat list, brand shown on each row. */
  grouped: boolean;
  groups: [string, T[]][];
}

/** Brands present in the sheet, in first-seen order, with how many items each has. */
export function brandCounts<T extends Priced>(rows: T[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.brand, (m.get(r.brand) ?? 0) + 1);
  return [...m.entries()];
}

/**
 * Default: rows grouped by brand, in the order the sheet came in (which already
 * runs cheapest first inside each brand).
 *
 * Price low to high: ONE list across every brand, cheapest first, with no brand
 * headers — the brand a phone belongs to has no say in where it sits. Sorting
 * inside each brand looked identical to the default, which is why it was not
 * what was wanted. An item with no price set (0) goes to the very end rather
 * than appearing as the cheapest; ties keep their existing order.
 *
 * `brand` limits either view to one brand ('' means all).
 */
export function buildView<T extends Priced>(
  rows: T[],
  opts: { brand: string; priceSort: PriceSort },
): SheetView<T> {
  const kept = rows.filter(r => !opts.brand || r.brand === opts.brand);

  if (opts.priceSort === 'asc') {
    const order = new Map(kept.map((r, i) => [r, i] as [T, number]));
    const sorted = [...kept].sort((a, b) => {
      const pa = a.price > 0 ? a.price : Number.POSITIVE_INFINITY;
      const pb = b.price > 0 ? b.price : Number.POSITIVE_INFINITY;
      if (pa === pb) return (order.get(a) ?? 0) - (order.get(b) ?? 0);
      return pa < pb ? -1 : 1;
    });
    return { grouped: false, groups: sorted.length ? [['All brands', sorted]] : [] };
  }

  const m = new Map<string, T[]>();
  for (const r of kept) {
    const list = m.get(r.brand);
    if (list) list.push(r); else m.set(r.brand, [r]);
  }
  return { grouped: true, groups: [...m.entries()] };
}
