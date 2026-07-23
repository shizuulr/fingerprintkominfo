import { useState } from 'react';
import { LuSearch, LuCalendarDays, LuTrash2 } from 'react-icons/lu';
import { getAttendanceByDate, getAttendanceByDateRange, deleteAttendanceLog, deleteAllAttendanceLogs } from '../services/attendanceService';
import StatusBadge from '../components/StatusBadge';

export default function AttendanceHistory() {
  const [filterType, setFilterType] = useState('single'); // 'single' or 'range'
  const [selectedDate, setSelectedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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
          <div className="filter-type">
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
          </div>

          <div className="filter-inputs">
            {filterType === 'single' ? (
              <div className="form-group">
                <label htmlFor="selectedDate">Pilih Tanggal</label>
                <input
                  type="date"
                  id="selectedDate"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            ) : (
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
            <button className="btn btn--primary" onClick={handleSearch} disabled={loading}>
              <LuSearch /> {loading ? 'Mencari...' : 'Cari'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {searched && (
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
                  <th>ID Fingerprint</th>
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
                      Tidak ada data absensi untuk tanggal yang dipilih
                    </td>
                  </tr>
                ) : (
                  attendance.map((item, index) => (
                    <tr key={item.id} className="table-row-animate">
                      <td>{index + 1}</td>
                      <td>{formatDateDisplay(item.date)}</td>
                      <td className="td-name">{item.userName}</td>
                      <td>
                        <code className="fingerprint-id">#{item.fingerprintId}</code>
                      </td>
                      <td>{formatTime(item.checkIn)}</td>
                      <td>{item.checkOut ? formatTime(item.checkOut) : <span className="text-muted">—</span>}</td>
                      <td>
                        <StatusBadge status={item.status} />
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
    </div>
  );
}
