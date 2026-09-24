import { Capacitor } from '@capacitor/core';

/**
 * Native device features, behind a single interface.
 *
 * Everything here degrades to a no-op on the web build, so pages can call
 * these freely without branching — the same code runs in the browser and in
 * the APK.
 */

export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * Camera scanning in a mobile browser (Chrome on Android) through the
 * built-in BarcodeDetector — no library, no download. The APK keeps using ML
 * Kit. Desktop browsers still rely on the USB barcode gun, so this is offered
 * on touch screens only.
 */
export const canWebScan = (): boolean =>
  typeof window !== 'undefined' &&
  'BarcodeDetector' in window &&
  !!navigator.mediaDevices?.getUserMedia &&
  window.matchMedia('(pointer: coarse)').matches;

/** True wherever a camera scan button should be shown. */
export const canScan = (): boolean => isNative() || canWebScan();

function webScanOnce(): Promise<ScanResult | null> {
  return new Promise(async (resolve, reject) => {
    let stream: MediaStream | null = null;
    let done = false;
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Scan barcode');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#000;display:flex;flex-direction:column';
    wrap.innerHTML = `
      <video playsinline muted style="flex:1;width:100%;object-fit:cover"></video>
      <div style="position:absolute;left:10%;right:10%;top:34%;height:22%;border:3px solid rgba(255,255,255,.9);border-radius:16px;box-shadow:0 0 0 100vmax rgba(0,0,0,.45)"></div>
      <div style="position:absolute;left:0;right:0;top:calc(34% - 44px);text-align:center;color:#fff;font:600 15px system-ui">Point at the EAN, IMEI or serial barcode</div>
      <button type="button" style="position:absolute;left:50%;transform:translateX(-50%);bottom:calc(28px + env(safe-area-inset-bottom));height:48px;padding:0 28px;border:none;border-radius:24px;background:#fff;color:#0f172a;font:700 15px system-ui">Cancel</button>`;
    const finish = (r: ScanResult | null, err?: unknown) => {
      if (done) return; done = true;
      stream?.getTracks().forEach(t => t.stop());
      wrap.remove();
      err ? reject(err) : resolve(r);
    };
    wrap.querySelector('button')!.addEventListener('click', () => finish(null));
    document.body.appendChild(wrap);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const video = wrap.querySelector('video')!;
      video.srcObject = stream;
      await video.play();
      const Detector = (window as any).BarcodeDetector;
      const det = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'] });
      const tick = async () => {
        if (done) return;
        try {
          const codes = await det.detect(video);
          const v = codes?.[0]?.rawValue?.trim();
          if (v) { navigator.vibrate?.(40); return finish({ value: v, format: String(codes[0].format) }); }
        } catch { /* frame not ready yet */ }
        setTimeout(tick, 120);
      };
      tick();
    } catch (e: any) {
      finish(null, new Error(e?.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow the camera for this site in your browser settings.'
        : 'Could not open the camera.'));
    }
  });
}

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
  if (!isNative()) return canWebScan() ? webScanOnce() : null;

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
