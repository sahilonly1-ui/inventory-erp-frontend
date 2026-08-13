import { Capacitor } from '@capacitor/core';

/**
 * Save a generated file so the operator can actually keep it.
 *
 * An anchor with a blob or data URL silently does nothing in an Android
 * WebView, which is why report and export downloads appeared to "not work" in
 * the APK. On native the bytes are written to Documents and handed to the
 * share sheet, so the file can be saved, mailed or sent to WhatsApp.
 */
export async function saveFile(filename: string, blob: Blob, mime: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick — revoking immediately can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  const base64 = await blobToBase64(blob);

  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });

  try {
    await Share.share({
      title: filename,
      text: filename,
      url: written.uri,
      dialogTitle: 'Save or share',
    });
  } catch {
    // The operator dismissed the sheet — the file is already on the device.
    alert(`Saved to Documents:\n${filename}`);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the generated file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      // Strip the "data:<mime>;base64," prefix Filesystem does not want.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Convert a canvas to a PNG blob without going through a data URL. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not render the image'))), 'image/png');
  });
}
