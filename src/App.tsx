import { ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import Products from './pages/Products';
import { Imei } from './pages/Imei';
import { Versions } from './pages/Versions';
import { Vendors } from './pages/Vendors';
import { StockIn } from './pages/StockIn';
import { StockOut } from './pages/StockOut';
import { Reports } from './pages/Reports';

const Shell = ({ children }: { children: ReactNode }) => (
  <ProtectedRoute>
    <Layout>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Layout>
  </ProtectedRoute>
);

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"     element={<Login />} />
        <Route path="/"          element={<Shell><Dashboard /></Shell>} />
        <Route path="/products"  element={<Shell><Products /></Shell>} />
        <Route path="/stock-in"  element={<Shell><StockIn /></Shell>} />
        <Route path="/stock-out" element={<Shell><StockOut /></Shell>} />
        <Route path="/imei"      element={<Shell><Imei /></Shell>} />
        <Route path="/vendors"   element={<Shell><Vendors /></Shell>} />
        <Route path="/reports"   element={<Shell><Reports /></Shell>} />
        <Route path="/versions"  element={<Shell><Versions /></Shell>} />
      </Routes>
    </AuthProvider>
  );
}
