import { useState, useEffect } from 'react';
import { LuUserCheck, LuClock, LuUserX, LuLogOut, LuTrash2, LuCheck, LuPrinter, LuX, LuShieldCheck } from 'react-icons/lu';
import { subscribeToTodayAttendance, getTodayDate, isFriday, isOffDay, deleteAttendanceLog, confirmSidediAttendance, getAttendanceByDateRange, submitLeavePermission } from '../services/attendanceService';
import { getActiveUsers } from '../services/userService';
import { getTodaySchedules } from '../services/sidediService';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const [attendance, setAttendance] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sidediSchedules, setSidediSchedules] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);

  // Print Global Modal States
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Sidedi Progress Rating Inline States
  const [rowRatings, setRowRatings] = useState({}); // { [userId]: ratingValue }

  // Leave Permission States
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveUser, setLeaveUser] = useState(null);
  const [leaveType, setLeaveType] = useState('S');
  const [leaveNote, setLeaveNote] = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Subscribe to today's attendance (real-time)
  useEffect(() => {
    const unsubscribe = subscribeToTodayAttendance((data) => {
      setAttendance(data);
    });
    return () => unsubscribe();
  }, []);

  // Get total active users and today's sidedi schedules
  useEffect(() => {
    const fetchUsersAndSchedules = async () => {
      try {
        const users = await getActiveUsers();
        setActiveUsers(users);
        setTotalUsers(users.length);

        const today = getTodayDate();
        const schedules = await getTodaySchedules(today);
        setSidediSchedules(schedules.filter(s => s.location === 'sidedi'));
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      }
    };
    fetchUsersAndSchedules();
  }, []);

  // Calculate statistics
  const izinCount = attendance.filter((a) => a.location === 'izin').length;
  const stats = {
    hadir: attendance.filter((a) => a.status === 'Hadir').length,
    terlambat: attendance.filter((a) => a.status === 'Terlambat').length,
    belumMasuk: totalUsers - attendance.length,
    sudahKeluar: attendance.filter((a) => a.checkOut !== null).length,
    izin: izinCount,
  };

  const formatTime = (date) => {
    if (!date) return '-';
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getDayLabel = () => {
    const now = new Date();
    if (isOffDay(now)) return '🔴 Hari Libur';
    if (isFriday(now)) return '🟢 Jumat (Keluar 14:30)';
    return '🟢 Hari Kerja (Keluar 16:00)';
  };

  const getDisplayId = (fingerprintId, division) => {
    if (!fingerprintId) return 'Belum Enroll';
    let prefix = division || 'USER';
    if (prefix === 'STATISTIK') prefix = 'Statistika';
    else if (prefix === 'SEKRETARIAT') prefix = 'Sekretariat';
    return `${prefix}${fingerprintId}`;
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus data absensi hari ini untuk peserta "${name}"?`)) {
      try {
        await deleteAttendanceLog(id);
      } catch (err) {
        alert('Gagal menghapus data absensi: ' + err.message);
      }
    }
  };

  const handleConfirmSidediDirect = async (user, progress) => {
    if (!user.fingerprintId) {
      alert('Peserta ini belum mendaftarkan sidik jari. Konfirmasi gagal.');
      return;
    }
    if (window.confirm(`Konfirmasi kehadiran di desa untuk ${user.name} dengan progress ${progress}%?`)) {
       try {
          const result = await confirmSidediAttendance(
            user.fingerprintId,
            user.name,
            user.division || '',
            progress
          );
          if (result.success) {
             alert(result.message);
          } else {
             alert('Gagal: ' + result.message);
          }
       } catch (error) {
          alert('Terjadi kesalahan: ' + error.message);
       }
    }
  };

  // --- Leave Permission Handlers ---
  const openLeaveModal = (user) => {
    setLeaveUser(user);
    setLeaveType('S');
    setLeaveNote('');
    setShowLeaveModal(true);
  };

  const handleSubmitLeave = async () => {
    if (!leaveUser) return;
    if (!leaveNote.trim()) {
      alert('Silakan isi keterangan izin.');
      return;
    }
    setLeaveLoading(true);
    try {
      const result = await submitLeavePermission(
        leaveUser.fingerprintId,
        leaveUser.name,
        leaveUser.division || '',
        leaveType,
        leaveNote.trim()
      );
      if (result.success) {
        alert(result.message);
        setShowLeaveModal(false);
      } else {
        alert('Gagal: ' + result.message);
      }
    } catch (error) {
      alert('Terjadi kesalahan: ' + error.message);
    } finally {
      setLeaveLoading(false);
    }
  };

  // Users who haven't attended today (eligible for leave permission)
  const usersWithoutAttendance = activeUsers.filter(user => {
    if (!user.fingerprintId) return false;
    return !attendance.some(a => a.fingerprintId === user.fingerprintId);
  });

  // Find users who are scheduled at sidedi but haven't confirmed attendance yet
  const unconfirmedSidediUsers = sidediSchedules.map(schedule => {
    return activeUsers.find(u => u.id === schedule.userId);
  }).filter(user => {
    if (!user) return false;
    const hasAttended = attendance.some(a => a.fingerprintId === user.fingerprintId);
    return !hasAttended;
  });

  const handlePrintGlobal = async () => {
    if (!startDate || !endDate) {
      alert('Pilih rentang tanggal terlebih dahulu.');
      return;
    }
    setIsPrinting(true);
    try {
      const logs = await getAttendanceByDateRange(startDate, endDate);
      
      const printWindow = window.open('', '', 'width=1100,height=800');
      
      let html = `
        <html>
        <head>
          <title>Rekap Absensi Keseluruhan</title>
          <style>
            @page { size: landscape; margin: 15mm; }
            body { font-family: Arial, sans-serif; font-size: 11px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
            th { background-color: #f3f4f6; text-align: center; }
            h2, h3 { text-align: center; margin: 5px 0; }
            .text-center { text-align: center; }
            .kop-surat { display: flex; align-items: center; justify-content: center; margin-bottom: 5px; position: relative; }
            .kop-logo { width: 60px; height: auto; position: absolute; left: 10px; }
            .kop-text { text-align: center; width: 100%; }
            .kop-text h3 { margin: 0; font-size: 13px; font-weight: normal; }
            .kop-text h2 { margin: 4px 0; font-size: 17px; font-weight: bold; }
            .kop-text p { margin: 2px 0; font-size: 9px; }
            .kop-line { border-bottom: 2px solid #000; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="kop-surat">
            <img src="${window.location.origin}/logo-temanggung.png" alt="Logo Temanggung" class="kop-logo">
            <div class="kop-text">
              <h3>PEMERINTAH KABUPATEN TEMANGGUNG</h3>
              <h2>DINAS KOMUNIKASI DAN INFORMATIKA</h2>
              <p>Jalan Jenderal Sudirman No.41-42 Temanggung 56216</p>
              <p>Telepon (0293) 496 1389 Faximili 496 1995</p>
              <p>Laman: www.kominfo.temanggungkab.go.id Pos-el : kominfo@temanggungkab.go.id</p>
            </div>
          </div>
          <div class="kop-line"></div>

          <h2>REKAPITULASI ABSENSI GLOBAL</h2>
          <h3 class="text-center" style="font-weight: normal; margin-bottom: 15px;">Periode: ${startDate} s/d ${endDate}</h3>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Tanggal</th>
                <th>Nama Peserta</th>
                <th>ID Fingerprint</th>
                <th>Waktu PKL</th>
                <th>Lokasi Penempatan</th>
                <th>Masuk</th>
                <th>Keluar</th>
                <th>Status / Keterangan</th>
              </tr>
            </thead>
            <tbody>
      `;

      if (logs.length === 0) {
        html += '<tr><td colspan="9" class="text-center">Tidak ada data absensi pada periode ini.</td></tr>';
      } else {
        logs.forEach((item, idx) => {
          const checkIn = item.checkIn ? new Date(item.checkIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
          const checkOut = item.checkOut ? new Date(item.checkOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
          
          const matchedUser = activeUsers.find(u => u.fingerprintId === item.fingerprintId);
          const pklDuration = matchedUser && matchedUser.startDate && matchedUser.endDate 
            ? `${matchedUser.startDate} s/d ${matchedUser.endDate}` 
            : '-';
            
          const displayId = getDisplayId(item.fingerprintId, item.division || (matchedUser ? matchedUser.division : ''));
          const penempatan = item.location === 'sidedi' ? 'Desa (SIDEDI)' : 'Kantor (KOMINFO)';

          html += '<tr>' +
            '<td class="text-center">' + (idx + 1) + '</td>' +
            '<td class="text-center">' + item.date + '</td>' +
            '<td>' + item.userName + '</td>' +
            '<td class="text-center">' + displayId + '</td>' +
            '<td class="text-center">' + pklDuration + '</td>' +
            '<td class="text-center">' + penempatan + '</td>' +
            '<td class="text-center">' + checkIn + '</td>' +
            '<td class="text-center">' + checkOut + '</td>' +
            '<td>' + item.status + '</td>' +
            '</tr>';
        });
      }

      html += `
            </tbody>
          </table>
          <p style="text-align: right; margin-top: 30px;">
            Dicetak pada: ${new Date().toLocaleString('id-ID')}
          </p>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
        </html>
      `;
      printWindow.document.write(html);
      printWindow.document.close();
      setShowPrintModal(false);
    } catch (err) {
      alert('Gagal mengambil data rekap: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Absensi</h1>
          <p className="page-subtitle">{formatDate(currentTime)} — {getDayLabel()}</p>
        </div>
        <div className="live-clock">
          <button className="btn btn--secondary" onClick={() => setShowPrintModal(true)} style={{ marginRight: '15px' }}>
            <LuPrinter style={{ marginRight: '8px' }} /> Rekap Global
          </button>
          <span className="live-clock__dot"></span>
          <span className="live-clock__time">{formatTime(currentTime)}</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <StatsCard
          icon={<LuUserCheck />}
          label="Hadir Tepat Waktu"
          value={stats.hadir}
          color="success"
        />
        <StatsCard
          icon={<LuClock />}
          label="Terlambat"
          value={stats.terlambat}
          color="warning"
        />
        <StatsCard
          icon={<LuUserX />}
          label="Belum Masuk"
          value={stats.belumMasuk < 0 ? 0 : stats.belumMasuk}
          color="danger"
        />
        <StatsCard
          icon={<LuLogOut />}
          label="Sudah Keluar"
          value={stats.sudahKeluar}
          color="info"
        />
        <StatsCard
          icon={<LuShieldCheck />}
          label="Izin"
          value={stats.izin}
          color="primary"
        />
      </div>

      {/* Konfirmasi Magang SIDEDI */}
      {unconfirmedSidediUsers.length > 0 && (
        <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #10b981' }}>
          <div className="card-header">
            <h2>Konfirmasi Kehadiran Magang Desa (SIDEDI)</h2>
            <span className="badge badge--warning">{unconfirmedSidediUsers.length} Menunggu</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nama Peserta</th>
                  <th>ID Fingerprint</th>
                  <th style={{ width: '180px' }}>Progress Kerja</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {unconfirmedSidediUsers.map(user => {
                  const currentRating = rowRatings[user.id] !== undefined ? rowRatings[user.id] : 50;
                  return (
                    <tr key={user.id}>
                      <td className="td-name">{user.name}</td>
                      <td>{user.fingerprintId ? getDisplayId(user.fingerprintId, user.division) : 'Belum Enroll'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            step="5"
                            value={currentRating} 
                            onChange={(e) => setRowRatings(prev => ({ ...prev, [user.id]: parseInt(e.target.value) }))}
                            style={{ flex: 1, accentColor: 'var(--color-success)', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-success-light)', minWidth: '35px' }}>{currentRating}%</span>
                        </div>
                      </td>
                      <td>
                        <button 
                          className="btn btn--primary" 
                          onClick={() => handleConfirmSidediDirect(user, currentRating)}
                          style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <LuCheck style={{ marginRight: '5px' }}/> Konfirmasi Hadir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Izin / Permission Section */}
      {usersWithoutAttendance.length > 0 && (
        <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid var(--color-primary)' }}>
          <div className="card-header">
            <h2><LuShieldCheck style={{ marginRight: '8px' }} /> Berikan Izin Peserta</h2>
            <span className="badge badge--default">{usersWithoutAttendance.length} Belum Absen</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nama Peserta</th>
                  <th>ID Fingerprint</th>
                  <th>Divisi</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {usersWithoutAttendance.map(user => (
                  <tr key={user.id}>
                    <td className="td-name">{user.name}</td>
                    <td>
                      <code className="fingerprint-id">{getDisplayId(user.fingerprintId, user.division)}</code>
                    </td>
                    <td>{user.division || '-'}</td>
                    <td>
                      <button
                        className="btn btn--secondary"
                        onClick={() => openLeaveModal(user)}
                        style={{ padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center' }}
                      >
                        <LuShieldCheck style={{ marginRight: '5px' }} /> Beri Izin
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance Table */}
      <div className="card">
        <div className="card-header">
          <h2>Daftar Absensi Hari Ini</h2>
          <span className="badge badge--info">{attendance.length} orang</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Peserta</th>
                <th>ID Fingerprint</th>
                <th>Lokasi</th>
                <th>Jam Masuk</th>
                <th>Jam Keluar</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan="8" className="table-empty">
                    Belum ada data absensi hari ini
                  </td>
                </tr>
              ) : (
                attendance.map((item, index) => (
                  <tr key={item.id} className="table-row-animate">
                    <td>{index + 1}</td>
                    <td className="td-name">{item.userName}</td>
                    <td>
                      <code className="fingerprint-id">{getDisplayId(item.fingerprintId, item.division)}</code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className={`badge badge--${item.location === 'sidedi' ? 'success' : item.location === 'izin' ? 'default' : 'info'}`}>
                          {item.location === 'sidedi' ? 'Desa (SIDEDI)' : item.location === 'izin' ? 'Izin' : 'Kantor (KOMINFO)'}
                        </span>
                        {item.location === 'sidedi' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                            <div style={{ flex: 1, minWidth: '60px', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${item.progress !== undefined && item.progress !== null ? item.progress : 0}%`, height: '100%', backgroundColor: '#10b981' }}></div>
                            </div>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#10b981' }}>{item.progress !== undefined && item.progress !== null ? item.progress : 0}%</span>
                          </div>
                        )}
                        {item.location === 'izin' && item.leaveNote && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                            Ket: {item.leaveNote}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{formatTime(item.checkIn)}</td>
                    <td>{item.checkOut ? formatTime(item.checkOut) : <span className="text-muted">—</span>}</td>
                    <td>
                      <StatusBadge status={item.checkOut ? item.status : (item.checkIn ? 'Belum Absen Keluar' : item.status)} />
                    </td>
                    <td>
                      <button
                        className="btn btn--icon btn--delete"
                        onClick={() => handleDelete(item.id, item.userName)}
                        title="Hapus Absen"
                      >
                        <LuTrash2 />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Cetak Rekap */}
      {showPrintModal && (
        <div className="modal-overlay">
          <div className="modal card">
            <div className="modal-header">
              <h2>Cetak Rekap Global</h2>
              <button className="btn btn--icon" onClick={() => setShowPrintModal(false)}>
                <LuX />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Tanggal Mulai</label>
                <input type="date" className="form-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Tanggal Akhir</label>
                <input type="date" className="form-control" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn--secondary" onClick={() => setShowPrintModal(false)}>Batal</button>
              <button className="btn btn--primary" onClick={handlePrintGlobal} disabled={isPrinting}>
                <LuPrinter style={{ marginRight: '5px' }} /> {isPrinting ? 'Mencetak...' : 'Cetak Rekap'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Izin Peserta */}
      {showLeaveModal && leaveUser && (
        <div className="modal-overlay">
          <div className="modal card">
            <div className="modal-header">
              <h2>Berikan Izin — {leaveUser.name}</h2>
              <button className="btn btn--icon" onClick={() => setShowLeaveModal(false)}>
                <LuX />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', fontSize: 'var(--font-size-sm)' }}>
                Pilih jenis izin dan berikan keterangan untuk <strong style={{ color: 'var(--text-primary)' }}>{leaveUser.name}</strong>.
              </p>

              {/* Leave Type Selector */}
              <div className="leave-type-selector">
                <div className="leave-type-option">
                  <input type="radio" id="leave-s" name="leaveType" value="S" checked={leaveType === 'S'} onChange={() => setLeaveType('S')} />
                  <label htmlFor="leave-s" className="leave-type-label">
                    <span className="leave-icon">🤒</span>
                    <span className="leave-code">S</span>
                    <span className="leave-name">Sakit</span>
                  </label>
                </div>
                <div className="leave-type-option">
                  <input type="radio" id="leave-k" name="leaveType" value="K" checked={leaveType === 'K'} onChange={() => setLeaveType('K')} />
                  <label htmlFor="leave-k" className="leave-type-label">
                    <span className="leave-icon">🏫</span>
                    <span className="leave-code">K</span>
                    <span className="leave-name">Sekolah / Kampus</span>
                  </label>
                </div>
                <div className="leave-type-option">
                  <input type="radio" id="leave-i" name="leaveType" value="I" checked={leaveType === 'I'} onChange={() => setLeaveType('I')} />
                  <label htmlFor="leave-i" className="leave-type-label">
                    <span className="leave-icon">📋</span>
                    <span className="leave-code">I</span>
                    <span className="leave-name">Lainnya</span>
                  </label>
                </div>
              </div>

              {/* Leave Note */}
              <div className="form-group">
                <label>Keterangan Izin *</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder={leaveType === 'S' ? 'Contoh: Demam tinggi, perlu istirahat di rumah' : leaveType === 'K' ? 'Contoh: Ujian semester / panggilan dosen pembimbing' : 'Contoh: Urusan keluarga / keperluan mendesak'}
                  value={leaveNote}
                  onChange={(e) => setLeaveNote(e.target.value)}
                  style={{
                    padding: '10px 16px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--font-size-sm)',
                    resize: 'vertical',
                    outline: 'none',
                    width: '100%',
                  }}
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)', padding: 'var(--space-lg) var(--space-xl)', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn--secondary" onClick={() => setShowLeaveModal(false)}>Batal</button>
              <button className="btn btn--primary" onClick={handleSubmitLeave} disabled={leaveLoading}>
                <LuShieldCheck style={{ marginRight: '5px' }} /> {leaveLoading ? 'Menyimpan...' : 'Konfirmasi Izin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
