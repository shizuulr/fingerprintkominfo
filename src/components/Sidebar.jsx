import { NavLink } from 'react-router-dom';
import { LuLayoutDashboard, LuUsers, LuCalendarDays, LuFingerprint, LuMapPin, LuSun, LuMoon } from 'react-icons/lu';
import { useTheme } from '../hooks/useTheme';

const menuItems = [
  { path: '/', icon: <LuLayoutDashboard />, label: 'Dashboard' },
  { path: '/peserta', icon: <LuUsers />, label: 'Peserta' },
  { path: '/riwayat', icon: <LuCalendarDays />, label: 'Riwayat' },
  { path: '/magang-sidedi', icon: <LuMapPin />, label: 'SIDEDI' },
];

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      {/* Desktop / Tablet sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src="/logo-temanggung.png" alt="Logo Temanggung" className="sidebar-logo-img" />
          </div>
          <h1>SIAP</h1>
          <p>Sistem Informasi Absensi PKL</p>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
          >
            {theme === 'dark' ? <LuSun /> : <LuMoon />}
          </button>
          <p>© 2026 Sistem Absensi</p>
          <p>Kerja Praktik</p>
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
        <button
          className="bottom-nav-link"
          onClick={toggleTheme}
        >
          <span className="bottom-nav-icon">{theme === 'dark' ? <LuSun /> : <LuMoon />}</span>
          <span className="bottom-nav-label">Tema</span>
        </button>
      </nav>
    </>
  );
}

