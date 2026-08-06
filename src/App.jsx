import { useEffect } from 'react';
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

export default function App() {
  // Inisialisasi global error handler sekali saat mount
  useEffect(() => {
    initGlobalErrorHandler();
  }, []);

  return (
    <Router>
      <ScanProcessor />
      <MqttListener />
      <DebugButton />
      <div className="app-layout">
        <Sidebar />
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