import { useState, useEffect } from 'react';
import { LuSearch, LuCalendarDays, LuTrash2, LuUser, LuX, LuPrinter } from 'react-icons/lu';
import { getAttendanceByDate, getAttendanceByDateRange, deleteAttendanceLog, deleteAllAttendanceLogs, getAttendanceStatus } from '../services/attendanceService';
import { getCompletedInterns, deleteCompletedIntern } from '../services/userService';
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

  const handleDeleteCompleted = async (id, name) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus data riwayat selesai magang untuk "${name}"? Tindakan ini tidak bisa dibatalkan.`)) {
      try {
        await deleteCompletedIntern(id);
        fetchCompleted();
      } catch (err) {
        alert('Gagal menghapus data: ' + err.message);
      }
    }
  };

  const handlePrintCompletedRecap = (intern) => {
    try {
      const data = intern.rekap_harian || [];
      
      let totalSidedi = 0;
      let totalKominfo = 0;
      
      data.forEach(item => {
         if (item.location === 'sidedi') {
            totalSidedi++;
         }
         else if (item.status && item.status.includes('Hadir')) totalKominfo++;
      });
      
      const printWindow = window.open('', '_blank');
      
      const today = new Date().toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const tableRows = data.length === 0 
        ? `<tr><td colspan="6" style="text-align: center; padding: 12px; border: 1px solid #ddd;">Tidak ada data kehadiran</td></tr>`
        : data.map((item, index) => {
            const dateObj = new Date(item.date + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString('id-ID', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
            const checkInStr = item.checkIn ? new Date(item.checkIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
            const checkOutStr = item.checkOut ? new Date(item.checkOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
            const locationStr = item.location === 'sidedi' ? 'SIDEDI' : 'KOMINFO';
            const isSidedi = item.location === 'sidedi';
            const progressInfo = isSidedi && item.progress !== undefined && item.progress !== null ? ` [Prog: ${item.progress}%]` : '';
            return `
              <tr>
                <td style="text-align: center; padding: 8px; border: 1px solid #ddd;">${index + 1}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${formattedDate}</td>
                <td style="text-align: center; padding: 8px; border: 1px solid #ddd;">${checkInStr}</td>
                <td style="text-align: center; padding: 8px; border: 1px solid #ddd;">${checkOutStr}</td>
                <td style="text-align: center; padding: 8px; border: 1px solid #ddd;">${locationStr}</td>
                <td style="text-align: center; padding: 8px; border: 1px solid #ddd; font-weight: bold; color: ${item.status && item.status.includes('Hadir') ? 'green' : 'red'};">${item.status}${progressInfo}</td>
              </tr>
            `;
          }).join('');

      printWindow.document.write(`
        <html>
          <head>
            <title>Rekap Absensi - ${intern.name}</title>
            <style>
              @page {
                size: portrait;
                margin: 20mm 15mm;
              }
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                color: #222;
                font-size: 12px;
                line-height: 1.5;
              }
              .kop-surat {
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 5px;
                position: relative;
              }
              .kop-logo {
                width: 70px;
                height: auto;
                position: absolute;
                left: 10px;
              }
              .kop-text {
                text-align: center;
                width: 100%;
              }
              .kop-text h3 {
                margin: 0;
                font-size: 16px;
                font-weight: normal;
                letter-spacing: 0.5px;
              }
              .kop-text h2 {
                margin: 4px 0;
                font-size: 18px;
                font-weight: bold;
                letter-spacing: 0.5px;
              }
              .kop-text p {
                margin: 2px 0;
                font-size: 11px;
                line-height: 1.3;
              }
              .kop-line {
                border-bottom: 3px solid #000;
                border-top: 1px solid #000;
                padding: 1px 0;
                margin-top: 15px;
                margin-bottom: 25px;
              }
              .report-title {
                text-align: center;
                margin-bottom: 25px;
                font-size: 16px;
                font-weight: bold;
                text-decoration: underline;
                text-transform: uppercase;
              }
              .info-table {
                width: 100%;
                margin-bottom: 20px;
                font-size: 12px;
                border-collapse: collapse;
              }
              .info-table td {
                padding: 5px 0;
                vertical-align: top;
              }
              .info-table td.label {
                width: 130px;
                font-weight: bold;
              }
              .info-table td.colon {
                width: 15px;
                text-align: center;
              }
              .data-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
                font-size: 11px;
              }
              .data-table th, .data-table td {
                border: 1px solid #999;
                padding: 8px 6px;
              }
              .data-table th {
                background-color: #f8f9fa;
                font-weight: bold;
                text-align: center;
                text-transform: uppercase;
              }
              .summary-box {
                margin-top: 25px;
                padding: 12px 15px;
                background-color: #f8f9fa;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
              }
              .summary-box strong {
                display: block;
                margin-bottom: 5px;
                font-size: 13px;
              }
              .footer-section {
                margin-top: 40px;
                display: flex;
                justify-content: space-between;
              }
              .print-date {
                text-align: right;
                margin-bottom: 60px;
              }
              .signature-container {
                display: flex;
                justify-content: space-between;
                margin-top: 20px;
              }
              .signature-box {
                text-align: center;
                width: 200px;
              }
              .signature-box.right {
                margin-left: auto;
              }
              .signature-space {
                height: 70px;
              }
              .signature-name {
                font-weight: bold;
                text-decoration: underline;
              }
            </style>
          </head>
          <body>
            <div class="kop-surat">
              <img src="${window.location.origin}/logo-temanggung.png" alt="Logo Pemkab Temanggung" class="kop-logo">
              <div class="kop-text">
                <h3>PEMERINTAH KABUPATEN TEMANGGUNG</h3>
                <h2>DINAS KOMUNIKASI DAN INFORMATIKA</h2>
                <p>Jalan Jenderal Sudirman No. 41-42 Temanggung Kode Pos 56216</p>
                <p>Telepon (0293) 4961389, Surat Elektronik: kominfo@temanggungkab.go.id</p>
                <p>Laman: kominfo.temanggungkab.go.id</p>
              </div>
            </div>
            <div class="kop-line"></div>
            
            <div class="report-title">LAPORAN REKAPITULASI KEHADIRAN MAGANG</div>
            
            <table class="info-table">
              <tr>
                <td class="label">Nama Peserta</td>
                <td class="colon">:</td>
                <td style="font-weight: bold; font-size: 13px;">${intern.name}</td>
              </tr>
              <tr>
                <td class="label">Instansi Asal</td>
                <td class="colon">:</td>
                <td>${intern.institution || '-'}</td>
              </tr>
              <tr>
                <td class="label">Jurusan</td>
                <td class="colon">:</td>
                <td>${intern.major || '-'}</td>
              </tr>
              <tr>
                <td class="label">Divisi / Penempatan</td>
                <td class="colon">:</td>
                <td>${intern.division || '-'}</td>
              </tr>
              <tr>
                <td class="label">Periode Magang</td>
                <td class="colon">:</td>
                <td>${intern.startDate ? `${intern.startDate} s/d ${intern.endDate}` : '-'}</td>
              </tr>
              <tr>
                <td class="label">Pembimbing</td>
                <td class="colon">:</td>
                <td>${intern.advisor || '-'} (${intern.no_hp_pembimbing || '-'})</td>
              </tr>
            </table>

            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 40px;">No</th>
                  <th style="width: 180px;">Hari & Tanggal</th>
                  <th>Jam Masuk</th>
                  <th>Jam Pulang</th>
                  <th>Lokasi Penugasan</th>
                  <th>Status Kehadiran</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div class="summary-box">
              <strong>RINGKASAN KEHADIRAN:</strong>
              Total Kehadiran di Kantor (KOMINFO): <strong>${totalKominfo} Hari</strong><br/>
              Total Kehadiran di Lapangan (SIDEDI): <strong>${totalSidedi} Hari</strong><br/>
              Total Ketidakhadiran (Izin): <strong>${intern.totalIzin || 0} Hari</strong><br/>
              Total Ketidakhadiran (Alfa): <strong>${intern.totalAlpa || 0} Hari</strong><br/>
              Total Hari Efektif Magang: <strong>${data.length} Hari</strong>
            </div>

            <div class="signature-container" style="margin-top: 30px;">
              <div class="signature-box">
                <p>Mengetahui,</p>
                <p>Pembimbing Lapangan</p>
                <div class="signature-space"></div>
                <p class="signature-name">${intern.advisor || '...........................................'}</p>
                <p>NIP. ...........................................</p>
              </div>
              <div class="signature-box right">
                <p>Temanggung, ${today}</p>
                <p>Peserta Magang,</p>
                <div class="signature-space"></div>
                <p class="signature-name">${intern.name}</p>
                <p>NIM/NISN. -</p>
              </div>
            </div>

            <script>
              window.onload = function() {
                window.print();
                window.onafterprint = function() {
                  window.close();
                }
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      alert('Gagal mencetak rekap: ' + err.message);
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
                      <td style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn--primary"
                          onClick={() => setSelectedIntern(intern)}
                          style={{ padding: '5px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                        >
                          Detail Riwayat
                        </button>
                        <button
                          className="btn"
                          onClick={() => handlePrintCompletedRecap(intern)}
                          style={{ padding: '5px 10px', fontSize: '11px', backgroundColor: 'var(--color-success)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                          title="Cetak Laporan Rekapitulasi"
                        >
                          <LuPrinter size={12} /> Cetak Rekap
                        </button>
                        <button
                          className="btn btn--danger"
                          onClick={() => handleDeleteCompleted(intern.id, intern.name)}
                          style={{ padding: '5px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                        >
                          <LuTrash2 size={12} /> Hapus
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
