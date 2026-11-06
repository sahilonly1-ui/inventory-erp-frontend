/**
 * How much to shrink a page so that all of it is on screen.
 *
 * `available` is the width the page has; `needed` is the width its content
 * wants (a wide table, a row of filters). Content that fits is left alone (1).
 * Content that does not is scaled down by the ratio — but never below `min`:
 * past that the text is too small to read, so the rest is left to scroll.
 * The result is rounded down a little so a fraction of a pixel never leaves a
 * stray scrollbar.
 */
export function fitZoom(available: number, needed: number, min = 0.5): number {
  if (!(available > 0) || !(needed > 0) || needed <= available + 1) return 1;
  const z = Math.floor((available / needed) * 1000) / 1000;
  return Math.min(1, Math.max(min, z));
}
