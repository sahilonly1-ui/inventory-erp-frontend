import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.itecharena.erp',
  appName: 'iTechArena ERP',
  webDir: 'dist',

  // The web build is bundled into the APK, so the app opens instantly and
  // still works when the showroom Wi-Fi drops. It talks to the same Render
  // backend the website uses, so data is always in sync — there is no second
  // copy of the app to keep up to date.
  android: {
    allowMixedContent: false,
    captureInput: true,          // hardware barcode guns type as a keyboard
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#1e293b',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1e293b',
    },
    // Scanning happens constantly, so the ML Kit module is bundled with the
    // APK rather than downloaded on first use — a scanner that needs the
    // internet before it works is useless on a shop floor.
    BarcodeScanner: {
      lensFacing: 'BACK',
    },
  },
};

export default config;
