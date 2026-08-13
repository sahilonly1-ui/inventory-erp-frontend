import { Capacitor } from '@capacitor/core';

/**
 * Native device features, behind a single interface.
 *
 * Everything here degrades to a no-op on the web build, so pages can call
 * these freely without branching — the same code runs in the browser and in
 * the APK.
 */

export const isNative = (): boolean => Capacitor.isNativePlatform();

// ── Haptics ────────────────────────────────────────────────────────────────
// A scan that only flashes on screen is easy to miss when you are looking at
// the product, not the phone. A short buzz confirms it landed.
export async function buzz(kind: 'ok' | 'error' = 'ok'): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (kind === 'ok') await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: NotificationType.Error });
  } catch { /* haptics are a nicety, never a failure */ }
}

// ── Barcode scanning ───────────────────────────────────────────────────────
export interface ScanResult {
  value: string;
  format: string;
}

/**
 * Ensure the ML Kit scanner module is present. On most devices it ships with
 * Play Services; on the rest it downloads once. Called ahead of the first
 * scan so the operator never waits mid-workflow.
 */
export async function prepareScanner(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
    }
    return true;
  } catch {
    return false;
  }
}

/** Ask for camera permission, prompting only when it hasn't been decided yet. */
export async function ensureCameraPermission(): Promise<boolean> {
  if (!isNative()) return false;
  const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
  const status = await BarcodeScanner.checkPermissions();
  if (status.camera === 'granted' || status.camera === 'limited') return true;
  if (status.camera === 'denied') return false;      // user said no; don't nag
  const asked = await BarcodeScanner.requestPermissions();
  return asked.camera === 'granted' || asked.camera === 'limited';
}

/**
 * Open the camera and return a single scanned code.
 *
 * Resolves to null when the operator backs out, so callers can simply do
 * nothing rather than handling an exception for an ordinary cancel.
 */
export async function scanOnce(): Promise<ScanResult | null> {
  if (!isNative()) return null;

  const allowed = await ensureCameraPermission();
  if (!allowed) {
    throw new Error('Camera permission is required to scan. Enable it in Settings → Apps → iTechArena ERP → Permissions.');
  }

  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
  await prepareScanner();

  const { barcodes } = await BarcodeScanner.scan({
    // Retail barcodes plus the 2D formats that appear on device boxes.
    formats: [
      BarcodeFormat.Ean13,
      BarcodeFormat.Ean8,
      BarcodeFormat.UpcA,
      BarcodeFormat.UpcE,
      BarcodeFormat.Code128,
      BarcodeFormat.Code39,
      BarcodeFormat.Code93,
      BarcodeFormat.Itf,
      BarcodeFormat.Codabar,
      BarcodeFormat.QrCode,
      BarcodeFormat.DataMatrix,
    ],
  });

  if (!barcodes.length) return null;      // cancelled
  const b = barcodes[0];
  await buzz('ok');
  return { value: (b.rawValue ?? '').trim(), format: String(b.format) };
}

/**
 * Scan repeatedly without closing the camera between reads.
 *
 * Stocking in a carton means dozens of scans in a row; reopening the camera
 * each time would dominate the task. `onScan` returning false stops the loop.
 */
export async function scanContinuous(
  onScan: (result: ScanResult) => boolean | Promise<boolean>,
): Promise<void> {
  if (!isNative()) return;

  const allowed = await ensureCameraPermission();
  if (!allowed) {
    throw new Error('Camera permission is required to scan.');
  }
  await prepareScanner();

  // Keep going until the caller says stop or the operator cancels.
  for (;;) {
    const hit = await scanOnce();
    if (!hit) return;
    const keepGoing = await onScan(hit);
    if (keepGoing === false) return;
  }
}

// ── Status bar / splash ────────────────────────────────────────────────────
export async function initNativeChrome(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#1e293b' });
  } catch { /* not fatal */ }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* not fatal */ }
}
