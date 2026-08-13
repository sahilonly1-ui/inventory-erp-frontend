import { ReactNode } from 'react';
import { M, MCard, MPill, MButton } from './ui';

/**
 * A scan row rendered as a card instead of a table row.
 *
 * The desktop grid needs seven columns side by side, which on a phone means
 * either unreadable slivers or sideways scrolling to reach the IMEI field —
 * both fatal for a workflow where the operator is holding a device in one hand.
 * Stacking the same fields keeps everything reachable with a thumb.
 */

export interface ScanRowView {
  id: string;
  index: number;
  ean: string;
  model: string;
  brand?: string;
  qty: number;
  imei: string;
  srno: string;
  status: string;
  errMsg: string;
  errField: string;
}

interface Props {
  row: ScanRowView;
  /** Rendered inputs, supplied by the page so its own handlers stay in charge. */
  eanInput: ReactNode;
  imeiInput: ReactNode;
  srnoInput: ReactNode;
  qtyInput?: ReactNode;
  onRemove: () => void;
  /** Hide the EAN field once the product is known, to cut visual noise. */
  collapseEan?: boolean;
}

export function MScanCard({ row, eanInput, imeiInput, srnoInput, qtyInput, onRemove, collapseEan = true }: Props) {
  const hasProduct = !!row.model;
  const hasCode = !!(row.imei || row.srno);
  const isError = row.status === 'err' || row.status === 'not_found';
  const isSaved = row.status === 'saved';
  const isLoading = row.status === 'loading';

  const tone = isError ? 'bad' : isSaved ? 'good' : hasProduct ? 'warn' : 'plain';

  return (
    <MCard tone={tone} style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header strip: row number, product, status, delete */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        padding: `10px ${M.pad}px`,
        borderBottom: hasProduct || isError ? `1px solid ${M.color.line}` : 'none',
      }}>
        <span style={{
          fontSize: M.text.micro, fontWeight: 800, color: M.color.faint,
          minWidth: 20, paddingTop: 2,
        }}>{row.index}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {hasProduct ? (
            <>
              <div style={{ fontSize: M.text.title, fontWeight: 700, color: M.color.ink, lineHeight: 1.3 }}>
                {row.model}
              </div>
              <div style={{ fontSize: M.text.micro, color: M.color.faint, marginTop: 2, fontFamily: 'monospace' }}>
                {row.ean}
              </div>
            </>
          ) : (
            <div style={{ fontSize: M.text.body, color: M.color.faint }}>
              {isLoading ? 'Looking up…' : 'Scan a barcode'}
            </div>
          )}

          {row.errMsg && (
            <div style={{ fontSize: M.text.meta, color: M.color.bad, marginTop: 5, lineHeight: 1.4 }}>
              {row.errMsg}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isSaved && <MPill tone="good">✓</MPill>}
          {!isSaved && hasProduct && !hasCode && <MPill tone="warn">Need code</MPill>}
          <button onClick={onRemove} aria-label="Remove row" style={{
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: 'transparent', color: M.color.faint, fontSize: 20,
            cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: M.pad, display: 'grid', gap: M.gap }}>
        {(!hasProduct || !collapseEan) && (
          <Labeled label="EAN / Barcode">{eanInput}</Labeled>
        )}

        {hasProduct && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: M.gap }}>
              <Labeled label="IMEI" accent="#dc2626">{imeiInput}</Labeled>
              <Labeled label="Sr. No." accent="#0369a1">{srnoInput}</Labeled>
            </div>
            {qtyInput && !hasCode && (
              <Labeled label="Quantity">{qtyInput}</Labeled>
            )}
          </>
        )}
      </div>
    </MCard>
  );
}

function Labeled({ label, accent, children }: { label: string; accent?: string; children: ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: M.text.micro, fontWeight: 700, marginBottom: 4,
        color: accent ?? M.color.muted, textTransform: 'uppercase', letterSpacing: '.05em',
      }}>{label}</div>
      {children}
    </div>
  );
}

/** Running totals plus the primary action, pinned above the tab bar. */
export function MScanFooter({
  items, units, onSave, saving, saveLabel = 'Save',
}: {
  items: number; units: number; onSave: () => void; saving?: boolean; saveLabel?: string;
}) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 62, zIndex: 110,
      background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(6px)',
      borderTop: `1px solid ${M.color.line}`,
      padding: `10px ${M.pad}px`,
      display: 'flex', alignItems: 'center', gap: M.gap,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: M.color.ink, lineHeight: 1.2 }}>
          {units} <span style={{ fontSize: M.text.meta, fontWeight: 600, color: M.color.muted }}>units</span>
        </div>
        <div style={{ fontSize: M.text.micro, color: M.color.faint }}>{items} item{items !== 1 ? 's' : ''} ready</div>
      </div>
      <MButton tone="brand" onClick={onSave} disabled={!items || saving} style={{ minWidth: 140 }}>
        {saving ? 'Saving…' : `${saveLabel} (${items})`}
      </MButton>
    </div>
  );
}
