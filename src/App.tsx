import { ReactNode, Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './pages/Login';

// Every page loaded in one bundle before this change — 964KB, downloaded in
// full before a person could even reach the login screen, then held in memory
// regardless of which single page they were using. Each of these becomes its
// own chunk instead, fetched only when its route is actually visited.
// Named exports are re-wrapped as default so React.lazy can load them; default
// exports pass straight through.
const pages = {
  Dashboard:      () => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })),
  Products:       () => import('./pages/Products'),
  Imei:           () => import('./pages/Imei').then(m => ({ default: m.Imei })),
  Versions:       () => import('./pages/Versions').then(m => ({ default: m.Versions })),
  Users:          () => import('./pages/Users'),
  ProductHistory: () => import('./pages/ProductHistory'),
  Suppliers:      () => import('./pages/Suppliers').then(m => ({ default: m.Suppliers })),
  StockIn:        () => import('./pages/StockIn').then(m => ({ default: m.StockIn })),
  OpeningStock:   () => import('./pages/OpeningStock').then(m => ({ default: m.OpeningStock })),
  Specs:          () => import('./pages/Specs'),
  StockReport:    () => import('./pages/StockReport').then(m => ({ default: m.StockReport })),
  StockOut:       () => import('./pages/StockOut').then(m => ({ default: m.StockOut })),
  Reports:        () => import('./pages/Reports').then(m => ({ default: m.Reports })),
  MarketPrices:   () => import('./pages/MarketPrices'),
};
const Dashboard      = lazy(pages.Dashboard);
const Products       = lazy(pages.Products);
const Imei           = lazy(pages.Imei);
const Versions       = lazy(pages.Versions);
const Users          = lazy(pages.Users);
const ProductHistory = lazy(pages.ProductHistory);
const Suppliers      = lazy(pages.Suppliers);
const StockIn        = lazy(pages.StockIn);
const OpeningStock   = lazy(pages.OpeningStock);
const Specs          = lazy(pages.Specs);
const StockReport    = lazy(pages.StockReport);
const StockOut       = lazy(pages.StockOut);
const Reports        = lazy(pages.Reports);
const MarketPrices   = lazy(pages.MarketPrices);
const PriceAgent     = lazy(() => import('./pages/PriceAgent'));

// Once the first screen is up, the other tabs are fetched quietly in the
// background, one at a time, so opening any of them later is instant instead
// of waiting on a download (in the app they come from the phone itself).
if (typeof window !== 'undefined') {
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1200));
  window.addEventListener('load', () => {
    const queue = Object.values(pages);
    const next = () => { const f = queue.shift(); if (f) f().catch(() => {}).finally(() => idle(next)); };
    setTimeout(() => idle(next), 1500);
  }, { once: true });
}

// A blank frame while a chunk downloads reads as a freeze; a small centred
// spinner makes it obviously "loading" instead. Chunks are a few hundred KB on
// a warm connection, so this is normally on screen well under a second.
const PageFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      border: '3px solid #e2e8f0', borderTopColor: '#2563eb',
      animation: 'spin 0.7s linear infinite',
    }} />
    <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
  </div>
);

const Shell = ({ children }: { children: ReactNode }) => (
  <ProtectedRoute>
    <Layout>
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </ErrorBoundary>
    </Layout>
  </ProtectedRoute>
);

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"      element={<Login />} />
        <Route path="/"           element={<Shell><Dashboard /></Shell>} />
        <Route path="/products"   element={<Shell><Products /></Shell>} />
        <Route path="/stock-in"   element={<Shell><StockIn /></Shell>} />
        <Route path="/opening-stock" element={<Shell><OpeningStock /></Shell>} />
        <Route path="/stock-report"   element={<Shell><StockReport /></Shell>} />
        <Route path="/specs"      element={<Shell><Specs /></Shell>} />
        <Route path="/stock-out"  element={<Shell><StockOut /></Shell>} />
        <Route path="/imei"       element={<Shell><Imei /></Shell>} />
        <Route path="/suppliers"  element={<Shell><Suppliers /></Shell>} />
        <Route path="/vendors"    element={<Shell><Suppliers /></Shell>} />
        <Route path="/reports"    element={<Shell><Reports /></Shell>} />
        <Route path="/versions"   element={<Shell><Versions /></Shell>} />
        <Route path="/users"      element={<Shell><Users /></Shell>} />
        <Route path="/product-history" element={<Shell><ProductHistory /></Shell>} />
        <Route path="/market-prices" element={<Shell><MarketPrices /></Shell>} />
        {/* Plain page (no sidebar) for Claude in Chrome to operate. */}
        <Route path="/market-prices/agent" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><PriceAgent /></Suspense></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}
