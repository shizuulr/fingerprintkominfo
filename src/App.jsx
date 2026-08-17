import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ScanProcessor from './components/ScanProcessor';
import MqttListener from './components/MqttListener';
import DebugButton from './components/DebugButton';
import ProtectedRoute from './components/ProtectedRoute';
import { initGlobalErrorHandler } from './services/debugService';
import { AuthProvider, useAuth } from './context/AuthContext';

const Dashboard       = lazy(() => import('./pages/Dashboard'));
const UserManagement  = lazy(() => import('./pages/UserManagement'));
const AttendanceHistory = lazy(() => import('./pages/AttendanceHistory'));
const SidediInternship  = lazy(() => import('./pages/SidediInternship'));
const Settings        = lazy(() => import('./pages/Settings'));
const Login           = lazy(() => import('./pages/Login'));

const ZOOM_MIN  = 50;
const ZOOM_MAX  = 200;
const ZOOM_STEP = 10;
const ZOOM_KEY  = 'app-zoom-level';

/* ─── Layout utama (hanya ditampilkan jika sudah login) ─── */
function AppLayout() {
  const { isAuthenticated } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem(ZOOM_KEY);
    return saved ? Number(saved) : 100;
  });

  // Inisialisasi global error handler sekali saat mount
  useEffect(() => {
    initGlobalErrorHandler();
  }, []);

  // Sidebar collapsed toggle
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  // Apply zoom level to document
  useEffect(() => {
    document.documentElement.style.setProperty('--app-zoom', zoomLevel / 100);
    localStorage.setItem(ZOOM_KEY, String(zoomLevel));
  }, [zoomLevel]);

  // Zoom with Ctrl+Scroll or Ctrl+Pinch (trackpad)
  useEffect(() => {
    const handleWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();

      setZoomLevel(prev => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + delta));
        return next;
      });
    };

    // Keyboard shortcuts: Ctrl+Plus, Ctrl+Minus, Ctrl+0
    const handleKeyDown = (e) => {
      if (!e.ctrlKey) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoomLevel(prev => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoomLevel(prev => Math.max(ZOOM_MIN, prev - ZOOM_STEP));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoomLevel(100);
      }
    };

    if (window.__zoomListenersAdded) return;
    window.__zoomListenersAdded = true;

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.__zoomListenersAdded = false;
    };
  }, []);

  const layoutClass = `app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`;

  // Background workers hanya aktif saat sudah login
  return (
    <>
      {isAuthenticated && <ScanProcessor />}
      {isAuthenticated && <MqttListener />}
      {isAuthenticated && <DebugButton />}
      <div className={layoutClass}>
        {isAuthenticated && (
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} zoomLevel={zoomLevel} />
        )}
        <main className={isAuthenticated ? 'main-content' : 'main-content--full'}>
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: 'var(--text-muted)' }}>
              Memuat halaman...
            </div>
          }>
            <Routes>
              {/* Route publik */}
              <Route path="/login" element={<Login />} />

              {/* Routes yang diproteksi login */}
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/peserta" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
              <Route path="/riwayat" element={<ProtectedRoute><AttendanceHistory /></ProtectedRoute>} />
              <Route path="/magang-sidedi" element={<ProtectedRoute><SidediInternship /></ProtectedRoute>} />
              <Route path="/pengaturan" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppLayout />
      </Router>
    </AuthProvider>
  );
}