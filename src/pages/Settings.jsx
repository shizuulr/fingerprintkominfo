import { useState, useEffect } from 'react';
import {
  LuSun, LuMoon, LuMonitor, LuRotateCcw, LuType, LuCheck, LuRefreshCw,
  LuWifi, LuWifiOff, LuUsb, LuSave, LuExternalLink, LuTriangleAlert, LuTerminal, LuTrash2,
  LuClock
} from 'react-icons/lu';
import { useTheme } from '../hooks/useTheme';
import { publishResetRequest } from '../components/MqttListener';
import DebugLogsViewer from '../components/DebugLogsViewer';
import { deleteOrphanAttendanceLogs } from '../services/attendanceService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export default function Settings() {
  const { theme, setThemeMode, fontSize, setFontSize } = useTheme();

  // Reset ESP32 state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetStatus, setResetStatus] = useState(null);

  // WiFi ESP32 state
  const [wifiMode, setWifiMode] = useState('network'); // 'network' | 'usb'
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [espIp, setEspIp] = useState('');
  const [usbPort, setUsbPort] = useState(null);
  const [wifiStatus, setWifiStatus] = useState(null);
  const [isSavingWifi, setIsSavingWifi] = useState(false);

  // Operational Hours state
  const [checkInDeadline, setCheckInDeadline] = useState('07:30');
  const [checkInDeadlineFriday, setCheckInDeadlineFriday] = useState('07:30');
  const [checkOutTimeDefault, setCheckOutTimeDefault] = useState('16:00');
  const [checkOutTimeFriday, setCheckOutTimeFriday] = useState('14:30');
  const [earliestCheckOut, setEarliestCheckOut] = useState('12:00');
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [saveScheduleStatus, setSaveScheduleStatus] = useState(null);

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const docRef = doc(db, 'system_settings', 'work_schedule');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.checkInDeadline) setCheckInDeadline(data.checkInDeadline);
          if (data.checkInDeadlineFriday) setCheckInDeadlineFriday(data.checkInDeadlineFriday);
          if (data.checkOutTimeDefault) setCheckOutTimeDefault(data.checkOutTimeDefault);
          if (data.checkOutTimeFriday) setCheckOutTimeFriday(data.checkOutTimeFriday);
          if (data.earliestCheckOut) setEarliestCheckOut(data.earliestCheckOut);
        }
      } catch (err) {
        console.error('Error fetching work schedule:', err);
      } finally {
        setIsLoadingSchedule(false);
      }
    };
    fetchSchedule();
  }, []);

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    setSaveScheduleStatus({ type: 'info', msg: 'Menyimpan jadwal...' });
    try {
      const docRef = doc(db, 'system_settings', 'work_schedule');
      await setDoc(docRef, {
        checkInDeadline,
        checkInDeadlineFriday,
        checkOutTimeDefault,
        checkOutTimeFriday,
        earliestCheckOut
      }, { merge: true });
      setSaveScheduleStatus({ type: 'success', msg: 'Jadwal berhasil diperbarui.' });
      setTimeout(() => setSaveScheduleStatus(null), 3000);
    } catch (err) {
      console.error('Error saving work schedule:', err);
      setSaveScheduleStatus({ type: 'error', msg: 'Gagal menyimpan: ' + err.message });
    }
  };

  // Halaman dashboard ini sedang HTTPS atau tidak (menentukan apakah fetch ke
  // ESP32 (http://) akan diblokir browser sebagai "mixed content")
  const isPageHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // Debug mode state
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem('debugMode') === 'true');
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);

  // Cleanup orphan logs state
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);

  const toggleDebugMode = () => {
    const newVal = !debugMode;
    setDebugMode(newVal);
    if (newVal) {
      localStorage.setItem('debugMode', 'true');
      window.dispatchEvent(new CustomEvent('debug-mode-activated'));
    } else {
      localStorage.removeItem('debugMode');
      window.dispatchEvent(new CustomEvent('debug-mode-deactivated'));
    }
  };

  const handleResetESP = () => {
    setResetStatus('sending');
    const success = publishResetRequest();
    if (success) {
      setResetStatus('success');
      setTimeout(() => {
        setResetStatus(null);
        setShowResetConfirm(false);
      }, 3000);
    } else {
      setResetStatus('error');
      setTimeout(() => setResetStatus(null), 4000);
    }
  };

  const handleConnectUSB = async () => {
    try {
      if (!('serial' in navigator)) {
        throw new Error('Browser Anda tidak mendukung WebSerial API.');
      }
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      setUsbPort(port);
      setWifiStatus({ type: 'success', msg: 'Terhubung ke perangkat via USB.' });
    } catch (err) {
      setWifiStatus({ type: 'error', msg: 'Koneksi USB dibatalkan atau gagal: ' + err.message });
    }
  };

  const normalizeIp = (raw) => {
    let targetIp = raw.trim();
    targetIp = targetIp.replace(/^https?:\/\//, '');
    if (targetIp.endsWith('/')) targetIp = targetIp.slice(0, -1);
    return targetIp;
  };

  // Cara paling andal: buka halaman konfigurasi bawaan ESP32 di tab baru.
  // Ini navigasi penuh (bukan fetch dari halaman HTTPS), jadi TIDAK kena
  // blokir mixed-content seperti metode fetch di bawah.
  const handleOpenDevicePage = () => {
    if (!espIp) {
      setWifiStatus({ type: 'error', msg: 'Isi dulu IP Address ESP32 sebelum membuka halaman perangkat.' });
      return;
    }
    const targetIp = normalizeIp(espIp);
    window.open(`http://${targetIp}/`, '_blank', 'noopener,noreferrer');
  };

  const handleSaveWifi = async (e) => {
    e.preventDefault();
    setIsSavingWifi(true);
    setWifiStatus(null);

    if (!wifiSsid) {
      setWifiStatus({ type: 'error', msg: 'SSID WiFi wajib diisi.' });
      setIsSavingWifi(false);
      return;
    }

    try {
      if (wifiMode === 'usb') {
        if (!usbPort) {
          setWifiStatus({ type: 'error', msg: 'Port USB belum terhubung. Silakan hubungkan dulu.' });
          setIsSavingWifi(false);
          return;
        }
        // Via USB
        const encoder = new TextEncoder();
        const writer = usbPort.writable.getWriter();
        await writer.write(encoder.encode(`${wifiSsid},${wifiPass}\n`));
        writer.releaseLock();
        setWifiStatus({ type: 'success', msg: 'Data terkirim via USB. ESP32 merestart...' });
      } else {
        // Via Jaringan (Fetch)
        if (!espIp) {
          setWifiStatus({ type: 'error', msg: 'IP Address ESP32 wajib diisi jika tidak menggunakan koneksi USB.' });
          setIsSavingWifi(false);
          return;
        }

        if (isPageHttps) {
          setWifiStatus({
            type: 'error',
            msg: 'Dashboard ini diakses via HTTPS, browser akan memblokir permintaan ke ESP32 (HTTP). Gunakan tombol "Buka Halaman Konfigurasi Perangkat" di bawah, atau mode USB.'
          });
          setIsSavingWifi(false);
          return;
        }

        const formData = new URLSearchParams();
        formData.append('ssid', wifiSsid);
        formData.append('pass', wifiPass);

        const targetIp = normalizeIp(espIp);

        const res = await fetch(`http://${targetIp}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString()
        });

        if (res.ok) {
          setWifiStatus({ type: 'success', msg: 'Data terkirim via Jaringan. ESP32 merestart...' });
        } else {
          throw new Error('Respons dari ESP32 tidak valid.');
        }
      }
    } catch (err) {
      const hint = wifiMode === 'network'
        ? ' (Kemungkinan diblokir browser karena mixed-content HTTPS→HTTP, atau IP salah/tidak satu jaringan. Coba tombol "Buka Halaman Konfigurasi Perangkat".)'
        : '';
      setWifiStatus({ type: 'error', msg: 'Gagal mengirim konfigurasi: ' + err.message + hint });
    }
    setIsSavingWifi(false);
  };

  const fontSizeOptions = [
    { value: 'kecil', label: 'Kecil', desc: 'Font lebih kecil', icon: 'A', size: '13px' },
    { value: 'sedang', label: 'Sedang', desc: 'Ukuran default', icon: 'A', size: '16px' },
    { value: 'besar', label: 'Besar', desc: 'Font lebih besar', icon: 'A', size: '19px' },
  ];

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pengaturan</h1>
          <p className="page-subtitle">Kelola tampilan dan perangkat sistem absensi</p>
        </div>
      </div>

      {/* ── Section 1: Tampilan / Theme ── */}
      <div className="card settings-card">
        <div className="card-header">
          <h2><LuMonitor /> Tampilan</h2>
        </div>
        <div className="settings-card__body">
          <p className="settings-description">Pilih mode tampilan yang nyaman untuk mata Anda</p>
          <div className="theme-selector">
            <button
              className={`theme-option ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setThemeMode('light')}
            >
              <div className="theme-option__icon theme-option__icon--light">
                <LuSun />
              </div>
              <div className="theme-option__info">
                <span className="theme-option__label">Mode Cerah</span>
                <span className="theme-option__desc">Tampilan terang untuk siang hari</span>
              </div>
              {theme === 'light' && <span className="theme-option__check"><LuCheck /></span>}
            </button>
            <button
              className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setThemeMode('dark')}
            >
              <div className="theme-option__icon theme-option__icon--dark">
                <LuMoon />
              </div>
              <div className="theme-option__info">
                <span className="theme-option__label">Mode Gelap</span>
                <span className="theme-option__desc">Nyaman untuk lingkungan gelap</span>
              </div>
              {theme === 'dark' && <span className="theme-option__check"><LuCheck /></span>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section 2: Ukuran Font ── */}
      <div className="card settings-card">
        <div className="card-header">
          <h2><LuType /> Ukuran Font</h2>
        </div>
        <div className="settings-card__body">
          <p className="settings-description">Sesuaikan ukuran teks agar lebih mudah dibaca</p>
          <div className="fontsize-selector">
            {fontSizeOptions.map((opt) => (
              <button
                key={opt.value}
                className={`fontsize-option ${fontSize === opt.value ? 'active' : ''}`}
                onClick={() => setFontSize(opt.value)}
              >
                <span className="fontsize-option__preview" style={{ fontSize: opt.size }}>
                  {opt.icon}
                </span>
                <div className="fontsize-option__info">
                  <span className="fontsize-option__label">{opt.label}</span>
                  <span className="fontsize-option__desc">{opt.desc}</span>
                </div>
                {fontSize === opt.value && <span className="fontsize-option__check"><LuCheck /></span>}
              </button>
            ))}
          </div>
          {/* Live Preview */}
          <div className="fontsize-preview">
            <span className="fontsize-preview__label">Preview:</span>
            <p className="fontsize-preview__text">
              Sistem Informasi Absensi PKL — Temanggung 2026
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 3: Jam Operasional Kerja ── */}
      <div className="card settings-card">
        <div className="card-header">
          <h2><LuClock /> Jam Operasional Kerja</h2>
        </div>
        <div className="settings-card__body">
          <p className="settings-description">
            Atur batas waktu masuk dan jam pulang untuk hari kerja biasa maupun khusus hari Jumat.
          </p>

          {isLoadingSchedule ? (
            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              <LuRefreshCw className="spin" style={{ marginRight: '8px' }} /> Memuat pengaturan...
            </div>
          ) : (
            <form onSubmit={handleSaveSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '12px' }}>
              
              {/* Alert Status Simpan */}
              {saveScheduleStatus && (
                <div className={`alert alert--${saveScheduleStatus.type === 'success' ? 'success' : saveScheduleStatus.type === 'error' ? 'danger' : 'info'}`} style={{ margin: 0 }}>
                  {saveScheduleStatus.msg}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                
                {/* Modul Hari Kerja Normal */}
                <div style={{ padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }}></span>
                    Hari Kerja (Senin – Kamis)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label className="form-label" style={{ fontWeight: '500', color: 'var(--text-primary)' }}>Batas Jam Masuk</label>
                      <input
                        type="time"
                        className="form-control"
                        value={checkInDeadline}
                        onChange={(e) => setCheckInDeadline(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Toleransi keterlambatan setelah jam ini.</span>
                    </div>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label className="form-label" style={{ fontWeight: '500', color: 'var(--text-primary)' }}>Jam Pulang Kerja</label>
                      <input
                        type="time"
                        className="form-control"
                        value={checkOutTimeDefault}
                        onChange={(e) => setCheckOutTimeDefault(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Modul Khusus Jumat */}
                <div style={{ padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                    Hari Jumat (Khusus)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label className="form-label" style={{ fontWeight: '500', color: 'var(--text-primary)' }}>Batas Jam Masuk Jumat</label>
                      <input
                        type="time"
                        className="form-control"
                        value={checkInDeadlineFriday}
                        onChange={(e) => setCheckInDeadlineFriday(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label className="form-label" style={{ fontWeight: '500', color: 'var(--text-primary)' }}>Jam Pulang Jumat</label>
                      <input
                        type="time"
                        className="form-control"
                        value={checkOutTimeFriday}
                        onChange={(e) => setCheckOutTimeFriday(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Batas Awal Mulai Absen Pulang */}
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label className="form-label" style={{ fontWeight: '600', display: 'block', marginBottom: '6px', color: 'var(--text-primary)' }}>Batas Mulai Absen Pulang (Earliest Check-Out)</label>
                  <input
                    type="time"
                    className="form-control"
                    value={earliestCheckOut}
                    onChange={(e) => setEarliestCheckOut(e.target.value)}
                    required
                    style={{ width: '200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', display: 'block' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                    Sistem tidak akan memproses scan pulang (check-out) jika dilakukan sebelum jam ini.
                  </span>
                </div>
              </div>

              <button type="submit" className="btn btn--primary" style={{ alignSelf: 'flex-start', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LuSave /> Simpan Pengaturan Jam Kerja
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── Section 4: Pengaturan Koneksi WiFi ESP32 ── */}
      <div className="card settings-card">
        <div className="card-header">
          <h2><LuWifi /> Koneksi WiFi ESP32</h2>
        </div>
        <div className="settings-card__body">
          <p className="settings-description">
            Ubah jaringan WiFi yang digunakan oleh pemindai sidik jari. Mendukung koneksi via IP Jaringan atau Serial USB.
          </p>

          {isPageHttps && wifiMode === 'network' && (
            <div className="alert alert--warning" style={{ marginBottom: '12px' }}>
              <LuTriangleAlert /> Dashboard ini diakses via HTTPS. Browser kemungkinan akan
              memblokir permintaan langsung ke ESP32 (HTTP). Disarankan pakai tombol
              &quot;Buka Halaman Konfigurasi Perangkat&quot; di bawah, atau mode USB.
            </div>
          )}

          <div className="wifi-settings-container">
            <div className="wifi-mode-selector" style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <button
                type="button"
                className={`btn ${wifiMode === 'network' ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => { setWifiMode('network'); setWifiStatus(null); }}
              >
                <LuWifi /> Mode Jaringan (HTTP)
              </button>
              <button
                type="button"
                className={`btn ${wifiMode === 'usb' ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => { setWifiMode('usb'); setWifiStatus(null); }}
              >
                <LuUsb /> Mode Kabel (USB)
              </button>
            </div>

            {wifiMode === 'usb' && (
              <div className="wifi-usb-section">
                <button
                  type="button"
                  className={`btn ${usbPort ? 'btn--success' : 'btn--secondary'} btn--usb-connect`}
                  onClick={handleConnectUSB}
                  disabled={usbPort !== null}
                >
                  <LuUsb /> {usbPort ? 'Tersambung via USB' : 'Hubungkan via USB'}
                </button>
                {usbPort && (
                  <span className="badge badge--success" style={{ marginLeft: '12px' }}>
                    WebSerial Aktif
                  </span>
                )}
              </div>
            )}

            <form onSubmit={handleSaveWifi} className="wifi-form">
              <div className="form-group">
                <label>SSID WiFi Baru</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nama Jaringan WiFi"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Password WiFi (kosongkan jika jaringan terbuka)</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Kata Sandi WiFi"
                  value={wifiPass}
                  onChange={(e) => setWifiPass(e.target.value)}
                />
              </div>

              {wifiMode === 'network' && (
                <div className="form-group">
                  <label>IP Address ESP32</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: 192.168.1.10"
                    value={espIp}
                    onChange={(e) => setEspIp(e.target.value)}
                  />
                </div>
              )}

              {wifiStatus && (
                <div className={`alert alert--${wifiStatus.type}`} style={{ marginBottom: '16px' }}>
                  {wifiStatus.type === 'success' ? <LuCheck /> : <LuRefreshCw />} {wifiStatus.msg}
                </div>
              )}

              <button
                type="submit"
                className="btn btn--primary"
                disabled={isSavingWifi}
                style={{ width: '100%' }}
              >
                {isSavingWifi ? 'Mengirim...' : <><LuSave /> Simpan & Restart ESP32</>}
              </button>

              {wifiMode === 'network' && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={handleOpenDevicePage}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  <LuExternalLink /> Buka Halaman Konfigurasi Perangkat
                </button>
              )}

              <p className="text-muted text-center" style={{ marginTop: '12px', fontSize: '0.8rem' }}>
                Mode pengiriman: {wifiMode === 'usb' ? <strong>Kabel USB (Serial)</strong> : <strong>Jaringan (HTTP POST)</strong>}
              </p>
            </form>
          </div>
        </div>
      </div>

      {/* ── Section 4: Reset ESP32 ── */}
      <div className="card settings-card settings-card--danger">
        <div className="card-header">
          <h2><LuRotateCcw /> Perangkat ESP32</h2>
        </div>
        <div className="settings-card__body">
          <div className="esp-reset-section">
            <div className="esp-reset__info">
              <h3>Reset Perangkat</h3>
              <p>
                Mengirim perintah restart ke perangkat ESP32 fingerprint scanner.
                Gunakan jika perangkat tidak merespons atau mengalami kendala.
              </p>
              <div className="esp-reset__warning">
                <LuRefreshCw />
                <span>Perangkat akan mati selama beberapa detik saat proses restart.</span>
              </div>
            </div>

            {!showResetConfirm ? (
              <button
                className="btn btn--danger btn--reset-esp"
                onClick={() => setShowResetConfirm(true)}
              >
                <LuRotateCcw /> Reset ESP32
              </button>
            ) : (
              <div className="esp-reset__confirm">
                <div className="esp-reset__confirm-box">
                  <LuRefreshCw className="esp-reset__confirm-icon" />
                  <p>Yakin ingin me-reset perangkat ESP32?</p>
                  <p className="text-muted">Proses absensi akan terhenti sementara.</p>

                  {resetStatus === 'success' && (
                    <div className="alert alert--success" style={{ marginTop: '12px' }}>
                      <LuWifi /> Perintah reset berhasil dikirim! ESP32 akan restart.
                    </div>
                  )}
                  {resetStatus === 'error' && (
                    <div className="alert alert--danger" style={{ marginTop: '12px' }}>
                      <LuWifiOff /> Gagal mengirim — pastikan MQTT terhubung.
                    </div>
                  )}

                  <div className="form-actions" style={{ justifyContent: 'center', borderTop: 'none', paddingTop: '12px' }}>
                    <button
                      className="btn btn--secondary"
                      onClick={() => { setShowResetConfirm(false); setResetStatus(null); }}
                      disabled={resetStatus === 'sending'}
                    >
                      Batal
                    </button>
                    <button
                      className="btn btn--danger"
                      onClick={handleResetESP}
                      disabled={resetStatus === 'sending' || resetStatus === 'success'}
                    >
                      {resetStatus === 'sending' ? (
                        <><LuRotateCcw className="spin" /> Mengirim...</>
                      ) : resetStatus === 'success' ? (
                        <><LuCheck /> Terkirim!</>
                      ) : (
                        <><LuRotateCcw /> Ya, Reset Sekarang</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 5: Manajemen Data ── */}
      <div className="card settings-card">
        <div className="card-header">
          <h2><LuRotateCcw /> Manajemen Data</h2>
        </div>
        <div className="settings-card__body">
          <p className="settings-description">
            Bersihkan data log absensi yang ditinggalkan oleh peserta yang sudah dihapus dari sistem.
            Fitur ini berguna jika di rekap absensi masih muncul nama peserta lama.
          </p>

          <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--text-primary)' }}>
              Bersihkan Log Absensi Peserta Tidak Aktif
            </strong>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '12px' }}>
              Menghapus semua catatan absensi dari peserta yang sudah dihapus.
              Data peserta aktif tidak akan terpengaruh.
            </span>

            {cleanupResult && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '12px',
                fontSize: '13px',
                backgroundColor: cleanupResult.deletedCount > 0
                  ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
                border: `1px solid ${cleanupResult.deletedCount > 0
                  ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}`,
                color: cleanupResult.deletedCount > 0
                  ? 'var(--color-success-light)' : 'var(--color-info-light)',
              }}>
                {cleanupResult.deletedCount > 0
                  ? `Berhasil menghapus ${cleanupResult.deletedCount} log dari ${cleanupResult.checkedCount} total log yang diperiksa.`
                  : `Tidak ada log yatim ditemukan. Semua ${cleanupResult.checkedCount} log sudah bersih.`
                }
              </div>
            )}

            <button
              className="btn btn--danger"
              id="cleanup-orphan-logs-btn"
              disabled={cleanupLoading}
              onClick={async () => {
                if (!window.confirm(
                  'Apakah Anda yakin ingin menghapus semua log absensi dari peserta yang sudah dihapus?\n\nLog absensi peserta aktif tidak akan terpengaruh.'
                )) return;
                setCleanupLoading(true);
                setCleanupResult(null);
                try {
                  const result = await deleteOrphanAttendanceLogs();
                  setCleanupResult(result);
                } catch (err) {
                  alert('Gagal membersihkan log: ' + err.message);
                } finally {
                  setCleanupLoading(false);
                }
              }}
            >
              {cleanupLoading ? 'Sedang membersihkan...' : <><LuTrash2 /> Bersihkan Log Lama</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section 6: Mode Pengembang / Debug ── */}
      <div className="card settings-card">
        <div className="card-header">
          <h2><LuTerminal /> Mode Pengembang & Debug</h2>
        </div>
        <div className="settings-card__body">
          <p className="settings-description">Fitur lanjutan untuk melihat laporan error sistem dan men-debug aplikasi saat terjadi masalah.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--text-primary)' }}>Tampilkan Tombol Debug</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Memunculkan tombol untuk mengambil snapshot log error.</span>
              </div>
              <button
                onClick={toggleDebugMode}
                style={{
                  width: '50px',
                  height: '26px',
                  borderRadius: '13px',
                  backgroundColor: debugMode ? '#10b981' : '#d1d5db',
                  border: 'none',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background-color 0.3s'
                }}
              >
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: '#fff',
                  position: 'absolute',
                  top: '2px',
                  left: debugMode ? '26px' : '2px',
                  transition: 'left 0.3s',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }} />
              </button>
            </div>

            <button className="btn btn--secondary" onClick={() => setIsLogViewerOpen(true)} style={{ width: '100%', justifyContent: 'center' }}>
              <LuExternalLink /> Lihat Daftar Log Laporan Debug
            </button>
          </div>
        </div>
      </div>

      {/* Modal Log Viewer */}
      <DebugLogsViewer isOpen={isLogViewerOpen} onClose={() => setIsLogViewerOpen(false)} />
    </div>
  );
}