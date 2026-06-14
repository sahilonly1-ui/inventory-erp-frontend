import { ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Inventory } from './pages/Inventory';
import { Imei } from './pages/Imei';

const Shell = ({ children }: { children: ReactNode }) => (
  <ProtectedRoute><Layout>{children}</Layout></ProtectedRoute>
);

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Shell><Dashboard /></Shell>} />
        <Route path="/products" element={<Shell><Products /></Shell>} />
        <Route path="/inventory" element={<Shell><Inventory /></Shell>} />
        <Route path="/imei" element={<Shell><Imei /></Shell>} />
      </Routes>
    </AuthProvider>
  );
}
