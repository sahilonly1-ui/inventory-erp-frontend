/*
 * Background saving for Stock In / Stock Out.
 *
 * The screen clears the moment Save is pressed and the entry is sent in the
 * background; a small chip shows "Saving…" then "Saved". If the server refuses
 * it, the page puts the rows back on screen and says why — nothing is lost.
 * While a save is still running, closing the tab asks for confirmation.
 */
type State = { pending: number; last: null | { ok: boolean; text: string; at: number } };
const state: State = { pending: 0, last: null };
const emit = () => window.dispatchEvent(new CustomEvent('erp-bgsave', { detail: { ...state } }));

window.addEventListener('beforeunload', e => {
  if (state.pending > 0) { e.preventDefault(); e.returnValue = ''; }
});

export function bgSave<T>(label: string, run: () => Promise<T>): Promise<T> {
  state.pending++; emit();
  return run().then(r => {
    state.pending--; state.last = { ok: true, text: `✓ ${label} saved`, at: Date.now() }; emit();
    return r;
  }, e => {
    state.pending--; state.last = { ok: false, text: `⚠ ${label} not saved`, at: Date.now() }; emit();
    throw e;
  });
}

export const bgSaveState = () => ({ ...state });
