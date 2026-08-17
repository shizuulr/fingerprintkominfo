import { useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { LuLayoutDashboard, LuUsers, LuCalendarDays, LuMapPin, LuSettings, LuPanelLeftClose, LuPanelLeftOpen, LuLogOut } from 'react-icons/lu';
import { useAuth } from '../context/AuthContext';

const menuItems = [
  { path: '/', icon: <LuLayoutDashboard />, label: 'Dashboard' },
  { path: '/peserta', icon: <LuUsers />, label: 'Peserta' },
  { path: '/riwayat', icon: <LuCalendarDays />, label: 'Riwayat' },
  { path: '/magang-sidedi', icon: <LuMapPin />, label: 'SIDEDI' },
  { path: '/pengaturan', icon: <LuSettings />, label: 'Pengaturan' },
];

export default function Sidebar({ collapsed = false, onToggle, zoomLevel }) {
  const { logout } = useAuth();


  // ── Tap 5x pada judul untuk mengaktifkan debug mode ──
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef(null);

  const handleTitleTap = useCallback(() => {
    tapCountRef.current += 1;

    // Reset counter setelah 2 detik tanpa tap
    clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);

    // Jika sudah 5 kali tap dalam 2 detik, aktifkan debug mode
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      clearTimeout(tapTimerRef.current);
      // Dispatch custom event yang didengarkan oleh DebugButton
      window.dispatchEvent(new CustomEvent('debug-mode-activated'));
    }
  }, []);

  return (
    <>
      {/* Desktop / Tablet sidebar */}
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        {/* Toggle Button */}
        <button
          className="sidebar-toggle"
          onClick={onToggle}
          title={collapsed ? 'Perluas Menu' : 'Kecilkan Menu'}
        >
          {collapsed ? <LuPanelLeftOpen /> : <LuPanelLeftClose />}
        </button>

        <div className="sidebar-brand" onClick={handleTitleTap} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <div className="sidebar-logo">
            <img src="/logo-temanggung.png" alt="Logo Temanggung" className="sidebar-logo-img" />
          </div>
          {!collapsed && (
            <>
              <h1>SIAP</h1>
              <p>Sistem Informasi Absensi PKL</p>
            </>
          )}
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {!collapsed && <span className="sidebar-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {/* Zoom indicator */}
          {zoomLevel !== undefined && zoomLevel !== 100 && (
            <span className="zoom-indicator" title="Zoom Level">
              {zoomLevel}%
            </span>
          )}

          {/* Tombol Logout */}
          <button
            className="sidebar-logout-btn"
            onClick={logout}
            title="Keluar dari Aplikasi"
          >
            <LuLogOut size={16} />
            {!collapsed && <span>Keluar</span>}
          </button>

          {!collapsed && (
            <>
              <p>© 2026 Sistem Absensi</p>
              <p>Kerja Praktik</p>
            </>
          )}
        </div>
      </aside>

      {/* Mobile bottom navigation — hidden on desktop via CSS */}
      <nav className="bottom-nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `bottom-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
