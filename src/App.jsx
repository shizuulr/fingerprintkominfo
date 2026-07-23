import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import AttendanceHistory from './pages/AttendanceHistory';
import ScanProcessor from './components/ScanProcessor';
import MqttListener from './components/MqttListener';
import SidediInternship from './pages/SidediInternship';

export default function App() {
  return (
    <Router>
      <ScanProcessor />
      <MqttListener />
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/peserta" element={<UserManagement />} />
            <Route path="/riwayat" element={<AttendanceHistory />} />
            <Route path="/magang-sidedi" element={<SidediInternship />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}