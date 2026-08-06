import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import AttendanceHistory from './pages/AttendanceHistory';
import ScanProcessor from './components/ScanProcessor';
import MqttListener from './components/MqttListener';
import SidediInternship from './pages/SidediInternship';
import Settings from './pages/Settings';
import DebugButton from './components/DebugButton';
import { initGlobalErrorHandler } from './services/debugService';

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const ZOOM_KEY = 'app-zoom-level';

export default function App() {
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

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const layoutClass = `app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`;

  return (
    <Router>
      <ScanProcessor />
      <MqttListener />
      <DebugButton />
      <div className={layoutClass} style={{ zoom: zoomLevel / 100 }}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} zoomLevel={zoomLevel} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/peserta" element={<UserManagement />} />
            <Route path="/riwayat" element={<AttendanceHistory />} />
            <Route path="/magang-sidedi" element={<SidediInternship />} />
            <Route path="/pengaturan" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}