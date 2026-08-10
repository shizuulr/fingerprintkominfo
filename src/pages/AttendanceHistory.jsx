import { useState, useEffect } from 'react';
import { LuSearch, LuCalendarDays, LuTrash2, LuUser, LuX } from 'react-icons/lu';
import { getAttendanceByDate, getAttendanceByDateRange, deleteAttendanceLog, deleteAllAttendanceLogs, getAttendanceStatus } from '../services/attendanceService';
import { getCompletedInterns } from '../services/userService';
import StatusBadge from '../components/StatusBadge';

export default function AttendanceHistory() {
  const [filterType, setFilterType] = useState('single'); // 'single', 'range', or 'completed'
  const [selectedDate, setSelectedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Completed Interns states
  const [completedInterns, setCompletedInterns] = useState([]);
  const [selectedIntern, setSelectedIntern] = useState(null);

  // Fetch completed interns automatically when filterType changes
  useEffect(() => {
    if (filterType === 'completed') {
      fetchCompleted();
    }
  }, [filterType]);

  const fetchCompleted = async () => {
    setLoading(true);
    try {
      const data = await getCompletedInterns();
      setCompletedInterns(data);
    } catch (err) {
      console.error('Error fetching completed interns:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);
    try {
      let data;
      if (filterType === 'single' && selectedDate) {
        data = await getAttendanceByDate(selectedDate);
      } else if (filterType === 'range' && startDate && endDate) {
        data = await getAttendanceByDateRange(startDate, endDate);
      } else {
        setLoading(false);
        return;
      }
      setAttendance(data);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus data absensi untuk "${name}"?`)) {
      try {
        await deleteAttendanceLog(id);
        // Refresh tabel setelah menghapus
        handleSearch();
      } catch (err) {
        alert('Gagal menghapus data absensi: ' + err.message);
      }
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm('PERINGATAN: Apakah Anda yakin ingin menghapus SELURUH data riwayat absensi di sistem? Tindakan ini tidak bisa dibatalkan.')) {
      try {
        const result = await deleteAllAttendanceLogs();
        alert(`Berhasil menghapus ${result.deletedCount} data absensi.`);
        setAttendance([]);
        handleSearch();
      } catch (err) {
        alert('Gagal mereset data absensi: ' + err.message);
      }
    }
  };

  const formatTime = (date) => {
    if (!date) return '-';
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Riwayat Absensi</h1>
          <p className="page-subtitle">Lihat data absensi berdasarkan tanggal</p>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card">
        <div className="card-header">
          <h2><LuCalendarDays /> Filter Tanggal</h2>
        </div>
        <div className="filter-section">
          <div className="filter-type" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <label className={`filter-tab ${filterType === 'single' ? 'active' : ''}`}>
              <input
                type="radio"
                name="filterType"
                value="single"
                checked={filterType === 'single'}
                onChange={() => setFilterType('single')}
              />
              Tanggal Tertentu
            </label>
            <label className={`filter-tab ${filterType === 'range' ? 'active' : ''}`}>
              <input
                type="radio"
                name="filterType"
                value="range"
                checked={filterType === 'range'}
                onChange={() => setFilterType('range')}
              />
              Rentang Tanggal
            </label>
            <label className={`filter-tab ${filterType === 'completed' ? 'active' : ''}`}>
              <input
                type="radio"
                name="filterType"
                value="completed"
                checked={filterType === 'completed'}
                onChange={() => setFilterType('completed')}
              />
              Peserta Selesai Magang
            </label>
          </div>

          <div className="filter-inputs">
            {filterType === 'single' && (
              <div className="form-group">
                <label htmlFor="selectedDate">Pilih Tanggal</label>
                <input
                  type="date"
                  id="selectedDate"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            )}
            {filterType === 'range' && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="startDate">Dari Tanggal</label>
                  <input
                    type="date"
                    id="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="endDate">Sampai Tanggal</label>
                  <input
                    type="date"
                    id="endDate"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}
            {filterType === 'completed' && (
              <div className="form-group">
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                  Menampilkan arsip riwayat peserta PKL yang telah menyelesaikan masa tugas magang secara resmi.
                </p>
              </div>
            )}
            {filterType !== 'completed' ? (
              <button className="btn btn--primary" onClick={handleSearch} disabled={loading}>
                <LuSearch /> {loading ? 'Mencari...' : 'Cari'}
              </button>
            ) : (
              <button className="btn btn--primary" onClick={fetchCompleted} disabled={loading}>
                Refresh
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results for Dates */}
      {filterType !== 'completed' && searched && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Hasil Pencarian</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span className="badge badge--info">{attendance.length} data</span>
              {attendance.length > 0 && (
                <button className="btn btn--danger" onClick={handleDeleteAll} style={{ padding: '6px 12px', fontSize: '12px' }}>
                  <LuTrash2 /> Hapus Semua
                </button>
              )}
            </div>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Nama Peserta</th>
                  <th>Instansi/Sekolah</th>
                  <th>Periode Magang</th>
                  <th>Jam Masuk</th>
                  <th>Jam Keluar</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="table-empty">
                      Tidak ada data absensi untuk tanggal yang dipilih
                    </td>
                  </tr>
                ) : (
                  attendance.map((item, index) => (
                    <tr key={item.id} className="table-row-animate">
                      <td>{index + 1}</td>
                      <td>{formatDateDisplay(item.date)}</td>
                      <td className="td-name">{item.userName}</td>
                      <td>{item.institution || '-'}</td>
                      <td>{item.startDate && item.endDate ? `${item.startDate} s/d ${item.endDate}` : '-'}</td>
                      <td>{formatTime(item.checkIn)}</td>
                      <td>{item.checkOut ? formatTime(item.checkOut) : <span className="text-muted">—</span>}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <StatusBadge status={getAttendanceStatus(item)} />
                          {item.izin_sementara && item.izin_sementara.length > 0 && (
                            <span
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#6366f1', color: 'white', fontSize: '10px', fontWeight: 'bold', cursor: 'help' }}
                              title={`Izin Keluar Sementara:\n${item.izin_sementara.map((iz, i) => `${i+1}. Keluar: ${iz.jam_keluar} - Kembali: ${iz.jam_kembali || 'Belum Kembali'}${iz.keterangan ? ` (${iz.keterangan})` : ''}`).join('\n')}`}
                            >
                              ⓘ
                            </span>
                          )}
                        </div>
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
      )}

      {/* Results for Completed Interns */}
      {filterType === 'completed' && (
        <div className="card">
          <div className="card-header">
            <h2>Daftar Peserta Selesai Magang</h2>
            <span className="badge badge--info">{completedInterns.length} orang</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Peserta</th>
                  <th>Instansi/Sekolah</th>
                  <th>Jurusan</th>
                  <th>Periode Magang</th>
                  <th>Ringkasan Absen</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {completedInterns.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="table-empty">
                      Belum ada data peserta selesai magang
                    </td>
                  </tr>
                ) : (
                  completedInterns.map((intern, index) => (
                    <tr key={intern.id} className="table-row-animate">
                      <td>{index + 1}</td>
                      <td className="td-name">{intern.name}</td>
                      <td>{intern.institution || '-'}</td>
                      <td>{intern.major || '-'}</td>
                      <td>{intern.startDate && intern.endDate ? `${intern.startDate} s/d ${intern.endDate}` : '-'}</td>
                      <td>
                        <span style={{ color: 'green', fontWeight: 'bold', fontSize: '11px', marginRight: '6px' }}>H: {intern.totalHadir || 0}</span>
                        <span style={{ color: '#6366f1', fontWeight: 'bold', fontSize: '11px', marginRight: '6px' }}>I: {intern.totalIzin || 0}</span>
                        <span style={{ color: 'red', fontWeight: 'bold', fontSize: '11px' }}>A: {intern.totalAlpa || 0}</span>
                      </td>
                      <td>
                        <button
                          className="btn btn--primary"
                          onClick={() => setSelectedIntern(intern)}
                          style={{ padding: '6px 12px', fontSize: '11px' }}
                        >
                          Detail Riwayat
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Detail Completed Intern */}
      {selectedIntern && (
        <div className="modal-overlay">
          <div className="modal card" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h2>Detail Peserta Selesai Magang — {selectedIntern.name}</h2>
              <button className="btn btn--icon" onClick={() => setSelectedIntern(null)}>
                <LuX />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
                <div>
                  <p style={{ margin: '4px 0' }}><strong>Nama:</strong> {selectedIntern.name}</p>
                  <p style={{ margin: '4px 0' }}><strong>Instansi:</strong> {selectedIntern.institution || '-'}</p>
                  <p style={{ margin: '4px 0' }}><strong>Jurusan:</strong> {selectedIntern.major || '-'}</p>
                  <p style={{ margin: '4px 0' }}><strong>Divisi Penempatan:</strong> {selectedIntern.division || '-'}</p>
                </div>
                <div>
                  <p style={{ margin: '4px 0' }}><strong>Pembimbing:</strong> {selectedIntern.advisor || '-'}</p>
                  <p style={{ margin: '4px 0' }}><strong>No HP Pembimbing:</strong> {selectedIntern.no_hp_pembimbing || '-'}</p>
                  <p style={{ margin: '4px 0' }}><strong>Periode Magang:</strong> {selectedIntern.startDate} s/d {selectedIntern.endDate}</p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Total Kehadiran:</strong>{' '}
                    <span style={{ color: 'green', fontWeight: 'bold' }}>Hadir: {selectedIntern.totalHadir || 0}</span>,{' '}
                    <span style={{ color: '#6366f1', fontWeight: 'bold' }}>Izin: {selectedIntern.totalIzin || 0}</span>,{' '}
                    <span style={{ color: 'red', fontWeight: 'bold' }}>Alpa: {selectedIntern.totalAlpa || 0}</span>
                  </p>
                </div>
              </div>

              <h3 style={{ fontSize: '14px', marginBottom: '10px', fontWeight: 'bold' }}>Rekap Absensi Harian:</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="table" style={{ fontSize: '12px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: '2px solid var(--border-color)', padding: '6px', textAlign: 'left' }}>No</th>
                      <th style={{ borderBottom: '2px solid var(--border-color)', padding: '6px', textAlign: 'left' }}>Tanggal</th>
                      <th style={{ borderBottom: '2px solid var(--border-color)', padding: '6px', textAlign: 'left' }}>Masuk</th>
                      <th style={{ borderBottom: '2px solid var(--border-color)', padding: '6px', textAlign: 'left' }}>Keluar</th>
                      <th style={{ borderBottom: '2px solid var(--border-color)', padding: '6px', textAlign: 'left' }}>Status</th>
                      <th style={{ borderBottom: '2px solid var(--border-color)', padding: '6px', textAlign: 'left' }}>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!selectedIntern.rekap_harian || selectedIntern.rekap_harian.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="table-empty" style={{ textAlign: 'center', padding: '12px' }}>Tidak ada data absensi.</td>
                      </tr>
                    ) : (
                      selectedIntern.rekap_harian.map((log, idx) => {
                        const checkInStr = log.checkIn ? new Date(log.checkIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
                        const checkOutStr = log.checkOut ? new Date(log.checkOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
                        const displayStatus = log.location === 'izin' ? `Izin (${log.leaveType})` : log.status;
                        return (
                          <tr key={log.id || idx}>
                            <td style={{ borderBottom: '1px solid var(--border-color)', padding: '6px' }}>{idx + 1}</td>
                            <td style={{ borderBottom: '1px solid var(--border-color)', padding: '6px' }}>{formatDateDisplay(log.date)}</td>
                            <td style={{ borderBottom: '1px solid var(--border-color)', padding: '6px' }}>{checkInStr}</td>
                            <td style={{ borderBottom: '1px solid var(--border-color)', padding: '6px' }}>{checkOutStr}</td>
                            <td style={{ borderBottom: '1px solid var(--border-color)', padding: '6px' }}>
                              <StatusBadge status={displayStatus} />
                            </td>
                            <td style={{ borderBottom: '1px solid var(--border-color)', padding: '6px' }}>
                              {log.location === 'izin' ? log.leaveNote : (log.location === 'sidedi' ? `SIDEDI [Prog: ${log.progress}%]` : '-')}
                              {log.izin_sementara && log.izin_sementara.length > 0 && (
                                <div style={{ fontSize: '10px', color: '#6366f1', marginTop: '2px' }}>
                                  Keluar Sementara: {log.izin_sementara.map(iz => `${iz.jam_keluar} s/d ${iz.jam_kembali || 'Belum Kembali'}`).join(', ')}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn--secondary" onClick={() => setSelectedIntern(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
