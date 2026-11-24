import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './theme/festive.css';
import { applyTheme, watchCalendar } from './theme/festive';
import { initNativeChrome } from './native/scanner';
import { initNetworkWatch } from './native/offline';

// Festive look by the festival calendar (Diwali, Holi, Gurpurab…) — visual only;
// each person can switch it in the sidebar.
applyTheme();
watchCalendar();

// No-op in the browser; styles the status bar and hides the splash in the APK.
void initNativeChrome();
// Watches connectivity and flushes anything queued the moment signal returns.
void initNetworkWatch();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
