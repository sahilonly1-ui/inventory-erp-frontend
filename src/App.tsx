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
const Dashboard      = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Products       = lazy(() => import('./pages/Products'));
const Imei           = lazy(() => import('./pages/Imei').then(m => ({ default: m.Imei })));
const Versions       = lazy(() => import('./pages/Versions').then(m => ({ default: m.Versions })));
const Users          = lazy(() => import('./pages/Users'));
const ProductHistory = lazy(() => import('./pages/ProductHistory'));
const Suppliers      = lazy(() => import('./pages/Suppliers').then(m => ({ default: m.Suppliers })));
const StockIn        = lazy(() => import('./pages/StockIn').then(m => ({ default: m.StockIn })));
const OpeningStock   = lazy(() => import('./pages/OpeningStock').then(m => ({ default: m.OpeningStock })));
const StockReport    = lazy(() => import('./pages/StockReport').then(m => ({ default: m.StockReport })));
const StockOut       = lazy(() => import('./pages/StockOut').then(m => ({ default: m.StockOut })));
const Reports        = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));

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
        <Route path="/stock-out"  element={<Shell><StockOut /></Shell>} />
        <Route path="/imei"       element={<Shell><Imei /></Shell>} />
        <Route path="/suppliers"  element={<Shell><Suppliers /></Shell>} />
        <Route path="/vendors"    element={<Shell><Suppliers /></Shell>} />
        <Route path="/reports"    element={<Shell><Reports /></Shell>} />
        <Route path="/versions"   element={<Shell><Versions /></Shell>} />
        <Route path="/users"      element={<Shell><Users /></Shell>} />
        <Route path="/product-history" element={<Shell><ProductHistory /></Shell>} />
      </Routes>
    </AuthProvider>
  );
}
