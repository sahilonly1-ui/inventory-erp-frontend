import { ReactNode, useLayoutEffect, useRef } from 'react';
import { fitZoom } from './fitZoom';

const MIN_ZOOM = 0.5;

// The viewport tag forbids pinch-zoom (a good thing for the phone layout), but once a page has been
// shrunk to fit, its text is small and the person needs to be able to zoom in to read it.
const viewportMeta = () => document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
let originalViewport: string | null = null;
function allowPinchZoom(on: boolean) {
  const meta = viewportMeta();
  if (!meta) return;
  if (originalViewport === null) originalViewport = meta.getAttribute('content') ?? '';
  const next = on
    ? originalViewport.replace(/,?\s*maximum-scale=[^,]*/i, '').replace(/,?\s*user-scalable=[^,]*/i, '') + ', maximum-scale=5.0'
    : originalViewport;
  if (meta.getAttribute('content') !== next) meta.setAttribute('content', next);
}

/**
 * The zoom currently applied (1 when none). A floating element placed from screen
 * coordinates (a popover opened next to a clicked cell) has to divide them by this,
 * because every length inside the zoomed page is shrunk by it, positions included.
 */
export function currentFitZoom(): number {
  const el = document.querySelector<HTMLElement>('.fit-inner');
  return el ? parseFloat(el.style.getPropertyValue('--fit-z')) || 1 : 1;
}

/**
 * Width the content wants, measured at its natural size.
 *
 * A wide table normally sits in its own scroll box, which does not widen the page
 * at all — it just hides the part that does not fit, and that hidden part is
 * exactly what falls off the screen. So each scroll box that is about as wide as
 * the page counts for how much it overflows. Narrower ones (a modal's body, a
 * strip of tabs) are meant to scroll and are left out.
 */
function neededWidth(inner: HTMLElement, available: number): number {
  let need = Math.max(inner.scrollWidth, available);
  for (const el of Array.from(inner.querySelectorAll<HTMLElement>('*'))) {
    const extra = el.scrollWidth - el.clientWidth;
    if (extra <= 1 || el.clientWidth < available * 0.6) continue;
    const ox = getComputedStyle(el).overflowX;
    if (ox === 'auto' || ox === 'scroll') need = Math.max(need, available + extra);
  }
  return need;
}

/**
 * Keeps a page that is wider than the screen entirely on screen.
 *
 * On a wide monitor nothing happens. On a phone using the browser's "desktop
 * site", the page is only about 1100 px wide, so a table with six store columns
 * ran off the right edge and could not be reached — zooming out does not help
 * when the overflow lives inside the page. The page is scaled down just enough
 * to fit (CSS zoom gives the content proportionally more room), and scaled back
 * as soon as the screen is wide enough again. Below MIN_ZOOM the text would be
 * unreadable, so the rest is left to scroll.
 */
export function FitToScreen({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current, inner = innerRef.current;
    if (!outer || !inner) return;
    let frame = 0;

    const fit = () => {
      frame = 0;
      inner.style.zoom = '1';                         // measure at natural size, in the same frame as the change
      const available = outer.clientWidth;
      const needed = neededWidth(inner, available);
      const z = fitZoom(available, needed, MIN_ZOOM);
      inner.style.zoom = z === 1 ? '' : String(z);
      // Heights written in vh shrink with the zoom too; this lets the CSS give them back (see .page-root).
      if (z === 1) inner.style.removeProperty('--fit-z'); else inner.style.setProperty('--fit-z', String(z));
      outer.classList.toggle('fit-scroll', needed * z > available + 2);   // still too wide at the floor
      allowPinchZoom(z < 1);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };

    fit();
    const ro = new ResizeObserver(schedule); ro.observe(outer);
    // Data arriving, rows being added, a panel opening: anything that can change the width.
    const mo = new MutationObserver(schedule); mo.observe(inner, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule).catch(() => {});
    return () => { allowPinchZoom(false); ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);

  return (
    <div ref={outerRef} className="fit-outer">
      <div ref={innerRef} className="fit-inner">{children}</div>
    </div>
  );
}
