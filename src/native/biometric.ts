import { isNative } from './scanner';

/**
 * Fingerprint / face sign-in for the Android app.
 *
 * The email and password are kept in the Android Keystore by the plugin
 * (hardware-backed, encrypted, never readable by the web layer until the
 * fingerprint check passes). Nothing here runs on the web build.
 *
 * Why the password and not the refresh token: refresh tokens rotate on every
 * use and expire, so a stored one goes stale within days. The stored password
 * keeps working until it is changed — and if it is changed, the first failed
 * attempt wipes the stored copy and asks for the new one.
 */
const SERVER = 'itecharena-erp';
const FLAG = 'erp_bio_enabled';
const OFFERED = 'erp_bio_offered';

async function plugin() {
  const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
  return NativeBiometric;
}

/** True when the phone has a fingerprint (or face) enrolled. */
export async function biometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const r = await (await plugin()).isAvailable();
    return !!r.isAvailable;
  } catch { return false; }
}

export const biometricEnabled = () => isNative() && localStorage.getItem(FLAG) === '1';
/** Whether the user was already asked once — so the prompt never nags. */
export const biometricOffered = () => localStorage.getItem(OFFERED) === '1';
export const markBiometricOffered = () => localStorage.setItem(OFFERED, '1');

export async function enableBiometric(email: string, password: string): Promise<void> {
  const p = await plugin();
  await p.verifyIdentity({
    reason: 'Confirm your fingerprint to turn on quick sign-in',
    title: 'Turn on fingerprint sign-in',
    negativeButtonText: 'Cancel',
  });
  await p.setCredentials({ server: SERVER, username: email, password });
  localStorage.setItem(FLAG, '1');
}

export async function disableBiometric(): Promise<void> {
  localStorage.removeItem(FLAG);
  try { await (await plugin()).deleteCredentials({ server: SERVER }); } catch { /* already gone */ }
}

/**
 * Ask for the fingerprint and hand back the stored credentials.
 * Resolves to null when the user cancels, so callers can fall back quietly.
 */
export async function unlockWithBiometric(): Promise<{ email: string; password: string } | null> {
  const p = await plugin();
  try {
    await p.verifyIdentity({
      reason: 'Sign in to iTechArena ERP',
      title: 'Sign in',
      negativeButtonText: 'Use password',
    });
  } catch { return null; }
  const c = await p.getCredentials({ server: SERVER });
  return { email: c.username, password: c.password };
}
