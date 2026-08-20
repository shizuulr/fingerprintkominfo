import { useState, useEffect, Fragment } from 'react';
import { LuCalendarDays, LuMapPin, LuUsers, LuSave, LuPrinter, LuPlus, LuTrash2, LuSearch } from 'react-icons/lu';
import {
  getAllSidediLocations,
  ensureDesaExists,
  addParticipantToSidedi,
  removeParticipantFromSidedi,
  saveSchedule,
  getSchedulesByDateRange,
} from '../services/sidediService';
import { getAllUsers } from '../services/userService';
import Modal from '../components/Modal';
import { getCachedHolidays, syncHolidays, addManualHoliday, deleteHoliday, getSpecialSchedules, addSpecialSchedule, deleteSpecialSchedule } from '../services/holidayService';
import { KECAMATAN_DESA, getDesaByKecamatan } from '../data/temanggungData';

export default function SidediInternship() {
  const [activeTab, setActiveTab] = useState('management');

  // ── Management states ──
  const [users, setUsers] = useState([]);
  const [sidediLocations, setSidediLocations] = useState([]); // dari Firestore {id, participantIds}
  const [selectedKecamatan, setSelectedKecamatan] = useState('');
  const [selectedDesa, setSelectedDesa] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal tambah peserta
  const [isAddPartModalOpen, setIsAddPartModalOpen] = useState(false);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');

  // ── Schedule states ──
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [schedules, setSchedules] = useState({});
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [holidays, setHolidays] = useState([]);
  const [specialSchedules, setSpecialSchedules] = useState([]);
  const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
  const [agendaForm, setAgendaForm] = useState({ tanggal: '', keterangan: '', jenis: 'agenda_penting' });
  const [agendaTrigger, setAgendaTrigger] = useState(0);
  const [scheduleSearchTerm, setScheduleSearchTerm] = useState('');

  // ── Load holidays ──
  useEffect(() => {
    const loadAgendas = async () => {
      // 1. Coba ambil dari Firestore & API untuk data terbaru
      try {
        let firestoreList = await getCachedHolidays();
        const hasThisYear = firestoreList.some(h => h.tanggal && h.tanggal.startsWith(String(currentYear)));
        if (!hasThisYear) {
          try {
            await syncHolidays(currentYear);
            firestoreList = await getCachedHolidays();
          } catch (syncErr) {
            console.warn('Auto-sync holidays failed:', syncErr);
          }
        }
        
        const thisYearFirestore = firestoreList.filter(h =>
          h.tanggal && h.tanggal.startsWith(String(currentYear))
        );
        
        setHolidays(thisYearFirestore);
      } catch (err) {
        console.warn('Gagal akses Firestore:', err);
        setHolidays([]);
      }

      try {
        const specialList = await getSpecialSchedules();
        const thisYearSpecial = specialList.filter(s =>
          s.tanggal && s.tanggal.startsWith(String(currentYear))
        );
        setSpecialSchedules(thisYearSpecial);
      } catch (err) {
        console.warn('Gagal akses Firestore (special schedules):', err);
        setSpecialSchedules([]);
      }
    };
    loadAgendas();
  }, [currentYear, agendaTrigger]);

  // ── Load users & sidedi locations ──
  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'schedule') fetchSchedules();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentMonth, currentYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersData, locsData] = await Promise.all([getAllUsers(), getAllSidediLocations()]);
      setUsers(usersData);
      setSidediLocations(locsData);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedules = async () => {
    try {
      const monthStr = currentMonth.toString().padStart(2, '0');
      const start = `${currentYear}-${monthStr}-01`;
      const end = `${currentYear}-${monthStr}-31`;
      const data = await getSchedulesByDateRange(start, end);
      const map = {};
      data.forEach(s => { map[`${s.userId}_${s.date}`] = s.location; });
      setSchedules(map);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Derived data ──
  const desaList = selectedKecamatan ? getDesaByKecamatan(selectedKecamatan) : [];

  const getDesaLocation = (desaId) => sidediLocations.find(l => l.id === desaId);

  const getDesaParticipants = (desaId) => {
    const loc = getDesaLocation(desaId);
    if (!loc) return [];
    return (loc.participantIds || []).map(pid => users.find(u => u.id === pid)).filter(Boolean);
  };

  // semua peserta yang sudah di-assign ke MANAPUN desa SIDEDI (untuk tab jadwal)
  const assignedUsersList = users.filter(u =>
    sidediLocations.some(loc => loc.participantIds?.includes(u.id))
  );

  // cari desa & kecamatan milik user
  const getUserDesaInfo = (userId) => {
    const loc = sidediLocations.find(l => l.participantIds?.includes(userId));
    if (!loc) return { desaName: '-', kecamatanName: '-' };
    // cari di KECAMATAN_DESA
    for (const kec of KECAMATAN_DESA) {
      const d = kec.desa.find(dd => dd.id === loc.id);
      if (d) return { desaName: d.name, kecamatanName: kec.name };
    }
    return { desaName: loc.name || '-', kecamatanName: loc.kecamatanName || '-' };
  };

  const filteredAssignedUsers = assignedUsersList.filter(u => {
    if (!scheduleSearchTerm) return true;
    const { desaName, kecamatanName } = getUserDesaInfo(u.id);
    const searchLower = scheduleSearchTerm.toLowerCase();
    return u.name.toLowerCase().includes(searchLower) ||
           desaName.toLowerCase().includes(searchLower) ||
           kecamatanName.toLowerCase().includes(searchLower);
  });

  // ── Management actions ──
  const handleOpenAddParticipant = async () => {
    if (!selectedDesa) return alert('Pilih desa terlebih dahulu');
    // Pastikan dokumen desa ada di Firestore
    const kec = KECAMATAN_DESA.find(k => k.id === selectedKecamatan);
    const desa = kec?.desa.find(d => d.id === selectedDesa);
    if (kec && desa) {
      await ensureDesaExists(desa.id, desa.name, kec.id, kec.name);
    }
    setSelectedUserToAdd('');
    setIsAddPartModalOpen(true);
  };

  const confirmAddParticipant = async () => {
    if (!selectedUserToAdd) return;
    try {
      await addParticipantToSidedi(selectedDesa, selectedUserToAdd);
      setIsAddPartModalOpen(false);
      setSelectedUserToAdd('');
      fetchData();
    } catch (err) {
      alert('Gagal menambahkan peserta: ' + err.message);
    }
  };

  const handleRemoveParticipant = async (desaId, userId) => {
    if (!window.confirm('Hapus peserta ini dari desa?')) return;
    await removeParticipantFromSidedi(desaId, userId);
    fetchData();
  };

  // ── Schedule helpers ──
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayName = (year, month, day) => {
    const d = new Date(year, month - 1, day);
    return ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()];
  };

  const isWeekend = (day) => {
    const d = new Date(currentYear, currentMonth - 1, day);
    return d.getDay() === 0 || d.getDay() === 6;
  };

  const getSpecialScheduleForDay = (day) => {
    const monthStr = currentMonth.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
    return specialSchedules.find(s => {
      if (!s.tanggal) return false;
      return (typeof s.tanggal === 'string' ? s.tanggal.split('T')[0] : '') === dateStr;
    }) || null;
  };

  const getHolidayForDay = (day) => {
    const monthStr = currentMonth.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
    return holidays.find(h => {
      if (!h.tanggal) return false;
      return (typeof h.tanggal === 'string' ? h.tanggal.split('T')[0] : '') === dateStr;
    }) || null;
  };

  const getDisplayId = (fingerprintId, division) => {
    if (!fingerprintId) return 'Belum Enroll';
    let prefix = division || 'USER';
    if (prefix === 'STATISTIK') prefix = 'Statistika';
    else if (prefix === 'SEKRETARIAT') prefix = 'Sekretariat';
    return `${prefix}${fingerprintId}`;
  };

  const handleScheduleChange = (userId, day, value) => {
    const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const key = `${userId}_${dateStr}`;
    setSchedules(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveAgenda = async () => {
    try {
      if (agendaForm.jenis === 'agenda_penting') {
        await addSpecialSchedule(agendaForm.tanggal, agendaForm.keterangan);
      } else {
        await addManualHoliday(agendaForm.tanggal, agendaForm.keterangan, agendaForm.jenis);
      }
      setIsAgendaModalOpen(false);
      setAgendaForm({ tanggal: '', keterangan: '', jenis: 'agenda_penting' });
      setAgendaTrigger(prev => prev + 1);
    } catch (err) {
      alert('Gagal menyimpan agenda: ' + err.message);
    }
  };

  const handleSaveSchedules = async () => {
    setIsSavingSchedule(true);
    try {
      const updates = [];
      for (const key in schedules) {
        const parts = key.split('_');
        const userId = parts[0];
        const date = parts[1];
        const user = users.find(u => u.id === userId);
        updates.push({ userId, userName: user?.name || 'Unknown', date, location: schedules[key] });
      }
      await Promise.all(updates.map(u => saveSchedule(u.userId, u.userName, u.date, u.location)));
      alert('Jadwal berhasil disimpan!');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan jadwal');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handlePrintScheduleRecap = () => {
    const printWindow = window.open('', '', 'width=1200,height=800');
    let tableHtml = `
      <style>
        @page { size: landscape; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #000; padding: 4px; text-align: center; }
        th { background-color: #f3f4f6; }
        .text-left { text-align: left; }
        .text-xs { font-size: 9px; color: #555; }
        .libur { background-color: #fee2e2; }
        .keterangan { margin-top: 15px; font-size: 10px; }
        .kop-surat { display: flex; align-items: center; justify-content: center; margin-bottom: 5px; position: relative; }
        .kop-logo { width: 60px; height: auto; position: absolute; left: 10px; }
        .kop-text { text-align: center; width: 100%; }
        .kop-text h3 { margin: 0; font-size: 13px; font-weight: normal; }
        .kop-text h2 { margin: 4px 0; font-size: 17px; font-weight: bold; }
        .kop-text p { margin: 2px 0; font-size: 9px; }
        .kop-line { border-bottom: 2px solid #000; margin-bottom: 20px; }
      </style>
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
      <h2 style="text-align: center;">REKAPITULASI PENJADWALAN MAGANG SIDEDI</h2>
      <h3 style="text-align: center; font-weight: normal; margin-bottom: 15px;">Bulan: ${new Date(0, currentMonth - 1).toLocaleString('id-ID', { month: 'long' })} ${currentYear}</h3>
      <table>
        <thead>
          <tr>
            <th class="text-left" style="width: 250px;">Data Peserta</th>
            ${daysArray.map(day => {
              const h = getHolidayForDay(day);
              const wknd = isWeekend(day);
              return `<th class="${h || wknd ? 'libur' : ''}">${day}<br/><span class="text-xs">${getDayName(currentYear, currentMonth, day)}</span></th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>`;

    if (assignedUsersList.length === 0) {
      tableHtml += `<tr><td colspan="${daysInMonth + 1}">Belum ada peserta.</td></tr>`;
    } else {
      assignedUsersList.forEach(user => {
        const { desaName, kecamatanName } = getUserDesaInfo(user.id);
        const displayId = getDisplayId(user.fingerprintId, user.division);
        tableHtml += `
          <tr>
            <td class="text-left">
              <strong>${user.name}</strong><br/>
              <span class="text-xs">ID: ${displayId} | No HP: ${user.phone || '-'}</span><br/>
              <span class="text-xs">${user.institution} - ${user.major || user.division}</span><br/>
              <span class="text-xs">Kec. ${kecamatanName} - ${desaName}</span>
            </td>`;
        daysArray.forEach(day => {
          const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          const val = schedules[`${user.id}_${dateStr}`];
          const displayVal = val === 'sidedi' ? 'D' : val === 'kominfo' ? 'K' : '';
          tableHtml += `<td>${displayVal}</td>`;
        });
        tableHtml += `</tr>`;
      });
    }
    tableHtml += `
        </tbody>
      </table>
      <div class="keterangan">
        <strong>Keterangan:</strong> D = Desa (SIDEDI) | K = Kantor (KOMINFO) | <span style="background:#fee2e2;padding:1px 4px;">Merah</span> = Libur/Cuti Bersama<br/>
        <em>Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</em>
      </div>`;

    printWindow.document.write(`<html><head><title>Cetak Rekap Penjadwalan</title></head><body>${tableHtml}<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script></body></html>`);
    printWindow.document.close();
  };

  // ── Render ──
  const currentDesaParticipants = selectedDesa ? getDesaParticipants(selectedDesa) : [];
  const assignedUserIds = sidediLocations.reduce((acc, loc) => acc.concat(loc.participantIds || []), []);
  const availableUsersForAdd = users.filter(u => !assignedUserIds.includes(u.id));

  return (
    <div className="sidedi-page">
      <div className="page-header">
        <h1>Magang SIDEDI</h1>
        <p className="subtitle">Manajemen penempatan Desa dan Penjadwalan kehadiran</p>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'management' ? 'active' : ''}`} onClick={() => setActiveTab('management')}>
          <LuMapPin /> Manajemen Desa
        </button>
        <button className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
          <LuCalendarDays /> Penjadwalan
        </button>
      </div>

      <div className="tab-content">
        {/* ══════════ TAB MANAJEMEN ══════════ */}
        {activeTab === 'management' && (
          <div className="management-tab card">
            <div className="card-header">
              <h2>Penempatan Desa/Kelurahan</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Kabupaten Temanggung — 20 Kecamatan, 289 Desa/Kelurahan
              </p>
            </div>

            {/* Dropdown berjenjang */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Pilih Kecamatan
                </label>
                <select
                  value={selectedKecamatan}
                  onChange={e => { setSelectedKecamatan(e.target.value); setSelectedDesa(''); }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }}
                >
                  <option value="">-- Pilih Kecamatan --</option>
                  {KECAMATAN_DESA.map(kec => (
                    <option key={kec.id} value={kec.id}>Kecamatan {kec.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Pilih Desa/Kelurahan
                </label>
                <select
                  value={selectedDesa}
                  onChange={e => setSelectedDesa(e.target.value)}
                  disabled={!selectedKecamatan}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px', opacity: !selectedKecamatan ? 0.5 : 1 }}
                >
                  <option value="">-- Pilih Desa/Kelurahan --</option>
                  {desaList.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <button
                className="btn btn--primary"
                onClick={handleOpenAddParticipant}
                disabled={!selectedDesa}
                style={{ padding: '10px 18px', whiteSpace: 'nowrap' }}
              >
                <LuPlus /> Tambah Peserta
              </button>
            </div>

            {/* Panel desa terpilih (untuk tambah/hapus peserta) */}
            {selectedDesa && (
              <div style={{ marginTop: '16px', padding: '16px', border: '2px solid var(--color-primary, #6366f1)', borderRadius: '10px', backgroundColor: 'var(--bg-input)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
                    ✏️ Edit Peserta — {desaList.find(d => d.id === selectedDesa)?.name}
                    <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      Kec. {KECAMATAN_DESA.find(k => k.id === selectedKecamatan)?.name}
                    </span>
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {currentDesaParticipants.length} peserta
                  </span>
                </div>
                {loading ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Memuat...</p>
                ) : currentDesaParticipants.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Belum ada peserta di desa ini.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {currentDesaParticipants.map(u => (
                      <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: '14px' }}>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            <LuUsers style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            {u.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', marginLeft: '24px' }}>
                            {u.institution} — {u.major || u.division} | HP: {u.phone || '-'}
                          </div>
                        </div>
                        <button
                          className="btn btn--icon btn--delete"
                          onClick={() => handleRemoveParticipant(selectedDesa, u.id)}
                          style={{ color: '#ef4444' }}
                        >
                          <LuTrash2 />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── Rekap Semua Peserta (selalu tampil) ── */}
            {(() => {
              // Kumpulkan semua kecamatan yang punya peserta
              const rekapKec = KECAMATAN_DESA.map(kec => {
                const desaDenganPeserta = kec.desa
                  .map(d => {
                    const loc = sidediLocations.find(l => l.id === d.id);
                    const peserta = (loc?.participantIds || [])
                      .map(pid => users.find(u => u.id === pid))
                      .filter(Boolean);
                    return { ...d, peserta };
                  })
                  .filter(d => d.peserta.length > 0);
                return { ...kec, desaDenganPeserta };
              }).filter(kec => kec.desaDenganPeserta.length > 0);

              const totalPeserta = rekapKec.reduce(
                (acc, kec) => acc + kec.desaDenganPeserta.reduce((a, d) => a + d.peserta.length, 0), 0
              );

              return (
                <div style={{ marginTop: '28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      📋 Rekap Semua Peserta Magang SIDEDI
                    </h3>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-input)', padding: '4px 10px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                      Total: <strong>{totalPeserta}</strong> peserta
                    </span>
                  </div>

                  {rekapKec.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-input)', borderRadius: '10px', border: '1px dashed var(--border-color)' }}>
                      <LuMapPin style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.4 }} />
                      <p>Belum ada peserta yang ditempatkan di desa manapun.</p>
                      <p style={{ fontSize: '12px' }}>Pilih kecamatan & desa di atas, lalu klik "Tambah Peserta".</p>
                    </div>
                  ) : (
                    rekapKec.map(kec => (
                      <div key={kec.id} style={{ marginBottom: '16px', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                        {/* Header Kecamatan */}
                        <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg-input)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                            🏘️ Kecamatan {kec.name}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {kec.desaDenganPeserta.reduce((a, d) => a + d.peserta.length, 0)} peserta
                          </span>
                        </div>

                        {/* Baris per Desa */}
                        {kec.desaDenganPeserta.map((d, di) => (
                          <div key={d.id} style={{ borderBottom: di < kec.desaDenganPeserta.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                            <div style={{ padding: '6px 16px 4px', backgroundColor: 'rgba(16,185,129,0.05)', borderBottom: '1px solid var(--border-color)' }}>
                              <span style={{ fontSize: '12px', fontWeight: '600', color: '#10b981' }}>
                                {d.name}
                              </span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <tbody>
                                {d.peserta.map((u, ui) => (
                                  <tr key={u.id} style={{ backgroundColor: ui % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                    <td style={{ padding: '8px 16px', borderBottom: ui < d.peserta.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', width: '36px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px' }}>
                                      {ui + 1}
                                    </td>
                                    <td style={{ padding: '8px 0', borderBottom: ui < d.peserta.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{u.name}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                        {u.institution} — {u.major || u.division}
                                      </div>
                                    </td>
                                    <td style={{ padding: '8px 16px', borderBottom: ui < d.peserta.length - 1 ? '1px solid var(--border-color)' : 'none', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'left', width: '160px' }}>
                                      HP: {u.phone || '-'}
                                    </td>
                                    <td style={{ padding: '8px 8px 8px 0', borderBottom: ui < d.peserta.length - 1 ? '1px solid var(--border-color)' : 'none', textAlign: 'right', width: '50px' }}>
                                      <button
                                        className="btn btn--icon btn--delete"
                                        onClick={() => handleRemoveParticipant(d.id, u.id)}
                                        style={{ color: '#ef4444', opacity: 0.7 }}
                                        title="Hapus peserta dari desa ini"
                                      >
                                        <LuTrash2 />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══════════ TAB PENJADWALAN ══════════ */}
        {activeTab === 'schedule' && (
          <div className="schedule-tab card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2>Jadwal Penempatan</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <select
                  value={currentMonth}
                  onChange={e => setCurrentMonth(parseInt(e.target.value))}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' })}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={currentYear}
                  onChange={e => setCurrentYear(parseInt(e.target.value))}
                  style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
                <button className="btn btn--primary" onClick={() => setIsAgendaModalOpen(true)}>
                  <LuPlus /> Tambah Agenda
                </button>
                <button className="btn btn--primary" onClick={handleSaveSchedules} disabled={isSavingSchedule}>
                  <LuSave /> {isSavingSchedule ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
                <button className="btn btn--secondary" onClick={handlePrintScheduleRecap}>
                  <LuPrinter /> Cetak Rekap
                </button>
              </div>
            </div>

            <div className="search-box" style={{ marginBottom: '16px' }}>
              <LuSearch className="search-icon" />
              <input
                type="text"
                placeholder="Cari berdasarkan nama peserta, nama desa, atau kecamatan..."
                value={scheduleSearchTerm}
                onChange={(e) => setScheduleSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="table-container custom-schedule-scroll" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '65vh', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <table className="schedule-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px 15px', borderBottom: '3px solid var(--color-primary-dark)', borderRight: '3px solid var(--color-primary-dark)', textAlign: 'left', minWidth: '220px', position: 'sticky', left: 0, top: 0, backgroundColor: 'var(--bg-sidebar)', zIndex: 3, boxShadow: '4px 4px 8px rgba(0,0,0,0.1)' }}>
                      Data Peserta
                    </th>
                    {daysArray.map(day => {
                      const holiday = getHolidayForDay(day);
                      const special = getSpecialScheduleForDay(day);
                      const weekend = isWeekend(day);
                      const isCuti = holiday?.jenis === 'cuti_bersama';
                      let bgColor = 'transparent';
                      if (weekend) bgColor = 'rgba(107,114,128,0.12)';
                      if (holiday) bgColor = isCuti ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.12)';
                      else if (special) bgColor = 'rgba(16,185,129,0.1)';
                      const textColor = (weekend || holiday) ? (isCuti ? '#ca8a04' : '#ef4444') : special ? '#059669' : 'var(--text-secondary)';

                      const combinedBg = bgColor !== 'transparent' ? `linear-gradient(${bgColor}, ${bgColor}), var(--bg-card)` : 'var(--bg-card)';

                      return (
                        <th key={day} style={{ padding: '6px 4px', borderBottom: '3px solid var(--color-primary-dark)', borderRight: '2px solid rgba(148,163,184,0.3)', textAlign: 'center', minWidth: '46px', fontSize: '11px', position: 'sticky', top: 0, zIndex: 2, background: combinedBg }} title={holiday ? `${holiday.keterangan} (${holiday.jenis === 'cuti_bersama' ? 'Cuti Bersama' : 'Libur Nasional'})` : special ? special.keterangan : weekend ? 'Hari Libur' : ''}>
                          <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{day}</div>
                          <div style={{ fontSize: '10px', color: textColor, marginTop: '1px', fontWeight: weekend || holiday || special ? '700' : 'normal' }}>
                            {getDayName(currentYear, currentMonth, day)}
                          </div>
                          {holiday && (
                            <div style={{ fontSize: '8px', color: isCuti ? '#ca8a04' : '#ef4444', fontWeight: 'bold', marginTop: '2px', lineHeight: 1.1, maxWidth: '44px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={holiday.keterangan}>
                              {holiday.keterangan.split(' ').slice(0, 2).join(' ')}
                            </div>
                          )}
                          {!holiday && special && (
                            <div style={{ fontSize: '8px', color: '#059669', fontWeight: 'bold', marginTop: '2px', lineHeight: 1.1, maxWidth: '44px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={special.keterangan}>
                              {special.keterangan.split(' ').slice(0, 2).join(' ')}
                            </div>
                          )}
                          {weekend && !holiday && !special && (
                            <div style={{ fontSize: '8px', color: '#6b7280', marginTop: '2px' }}>Libur</div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth + 1} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                        Belum ada peserta yang sesuai dengan pencarian atau ditugaskan.
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      const groupedUsers = filteredAssignedUsers.reduce((acc, user) => {
                        const div = user.division || 'Belum Ditentukan';
                        if (!acc[div]) acc[div] = [];
                        acc[div].push(user);
                        return acc;
                      }, {});

                      return Object.keys(groupedUsers).sort().map(division => (
                        <Fragment key={division}>
                          <tr>
                            <td colSpan={daysInMonth + 1} style={{ padding: '8px 12px', backgroundColor: 'rgba(99, 102, 241, 0.1)', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', color: 'var(--color-primary-light)', position: 'sticky', left: 0, zIndex: 1 }}>
                              Bidang / Divisi: {division}
                            </td>
                          </tr>
                          {groupedUsers[division].map(user => {
                            const { desaName, kecamatanName } = getUserDesaInfo(user.id);
                      return (
                        <tr key={user.id}>
                          <td style={{ padding: '8px 12px', borderBottom: '2px solid rgba(148,163,184,0.3)', borderRight: '3px solid var(--color-primary-dark)', position: 'sticky', left: 0, backgroundColor: 'var(--bg-sidebar)', zIndex: 1, boxShadow: '4px 0 8px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{user.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{user.institution} — {user.major || user.division}</div>
                            <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>{desaName} (Kec. {kecamatanName})</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {getDisplayId(user.fingerprintId, user.division)}</div>
                          </td>
                          {daysArray.map(day => {
                            const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                            const key = `${user.id}_${dateStr}`;
                            const value = schedules[key] || '';
                            const weekend = isWeekend(day);
                            const holiday = getHolidayForDay(day);
                            let cellBg = 'transparent';
                            if (weekend) cellBg = 'rgba(107,114,128,0.06)';
                            if (holiday) cellBg = holiday.jenis === 'cuti_bersama' ? 'rgba(234,179,8,0.06)' : 'rgba(239,68,68,0.06)';

                            return (
                              <td key={day} style={{ padding: '3px', borderBottom: '2px solid rgba(148,163,184,0.3)', borderRight: '2px solid rgba(148,163,184,0.3)', textAlign: 'center', backgroundColor: cellBg }}>
                                <select
                                  value={value}
                                  onChange={e => handleScheduleChange(user.id, day, e.target.value)}
                                  disabled={weekend || holiday}
                                  style={{
                                    padding: '3px 2px',
                                    border: 'none',
                                    background: weekend || holiday ? 'transparent' : value === 'sidedi' ? 'rgba(16,185,129,0.2)' : value === 'kominfo' ? 'rgba(59,130,246,0.2)' : 'transparent',
                                    color: weekend || holiday ? '#9ca3af' : value === 'sidedi' ? '#10b981' : value === 'kominfo' ? '#3b82f6' : 'var(--text-secondary)',
                                    fontWeight: value ? 'bold' : 'normal',
                                    borderRadius: '4px',
                                    width: '100%',
                                    cursor: weekend || holiday ? 'not-allowed' : 'pointer',
                                    appearance: 'none',
                                    textAlign: 'center',
                                    fontSize: '12px',
                                  }}
                                  title={weekend || holiday ? 'Hari Libur' : value === 'sidedi' ? 'Desa' : value === 'kominfo' ? 'Kantor' : 'Pilih'}
                                >
                                  <option value="" style={{ color: '#000' }}>-</option>
                                  {!(weekend || holiday) && <>
                                    <option value="sidedi" style={{ color: '#000' }}>D</option>
                                    <option value="kominfo" style={{ color: '#000' }}>K</option>
                                  </>}
                                </select>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                ));
                    })()
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ padding: '8px 15px', fontWeight: 'bold', textAlign: 'right', borderTop: '3px solid var(--color-primary-dark)', borderRight: '3px solid var(--color-primary-dark)', position: 'sticky', left: 0, bottom: 0, backgroundColor: 'var(--bg-sidebar)', zIndex: 3, boxShadow: '4px -4px 8px rgba(0,0,0,0.1)', color: 'var(--text-primary)' }}>
                      Total Kehadiran
                    </td>
                    {daysArray.map(day => {
                      const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                      let totalD = 0;
                      let totalK = 0;
                      // Hitung total dari SEMUA peserta yg di-assign, bukan cuma yg di-filter
                      assignedUsersList.forEach(user => {
                        const val = schedules[`${user.id}_${dateStr}`];
                        if (val === 'sidedi') totalD++;
                        if (val === 'kominfo') totalK++;
                      });
                      const weekend = isWeekend(day);
                      const holiday = getHolidayForDay(day);
                      let cellBg = 'var(--bg-card)';
                      if (weekend) cellBg = 'rgba(107,114,128,0.1)';
                      if (holiday) cellBg = holiday.jenis === 'cuti_bersama' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)';

                      const combinedBg = cellBg !== 'var(--bg-card)' ? `linear-gradient(${cellBg}, ${cellBg}), var(--bg-card)` : 'var(--bg-card)';

                      return (
                        <td key={day} style={{ padding: '6px 2px', borderTop: '3px solid var(--color-primary-dark)', borderRight: '2px solid rgba(148,163,184,0.3)', textAlign: 'center', background: combinedBg, fontSize: '11px', fontWeight: 'bold', position: 'sticky', bottom: 0, zIndex: 2, boxShadow: '0 -4px 8px rgba(0,0,0,0.05)' }}>
                          <div style={{ color: '#10b981', display: totalD > 0 ? 'block' : 'none' }}>D: {totalD}</div>
                          <div style={{ color: '#3b82f6', display: totalK > 0 ? 'block' : 'none' }}>K: {totalK}</div>
                          {totalD === 0 && totalK === 0 && <div style={{ color: 'var(--text-muted)' }}>-</div>}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Keterangan warna */}
            <div style={{ marginTop: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span><strong>D</strong> = Desa (SIDEDI)</span>
              <span><strong>K</strong> = Kantor (KOMINFO)</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'rgba(16,185,129,0.15)', display: 'inline-block' }}></span>
                Agenda Penting
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'rgba(239,68,68,0.2)', display: 'inline-block' }}></span>
                Libur Nasional
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'rgba(234,179,8,0.2)', display: 'inline-block' }}></span>
                Cuti Bersama
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'rgba(107,114,128,0.15)', display: 'inline-block' }}></span>
                Sabtu/Minggu (Libur)
              </span>
            </div>

            {/* Daftar Hari Libur dan Agenda Bulan Ini */}
            {(() => {
              const mStr = currentMonth.toString().padStart(2, '0');
              const prefix = `${currentYear}-${mStr}`;
              const monthHolidaysRaw = holidays
                .map(h => ({
                  ...h,
                  _date: typeof h.tanggal === 'string' ? h.tanggal.split('T')[0] : '',
                }))
                .filter(h => h._date && h._date.startsWith(prefix));
              const monthSpecialsRaw = specialSchedules
                .map(s => ({
                  ...s,
                  _date: typeof s.tanggal === 'string' ? s.tanggal.split('T')[0] : '',
                  jenis: 'agenda_penting'
                }))
                .filter(s => s._date && s._date.startsWith(prefix));

              // Gabungkan dan urutkan
              const allAgendasRaw = [...monthHolidaysRaw, ...monthSpecialsRaw].sort((a, b) => a._date.localeCompare(b._date));

              // Cegah duplikasi UI
              const uniqueAgendas = [];
              const seen = new Set();
              for (const a of allAgendasRaw) {
                const key = a._date + '_' + a.keterangan;
                if (!seen.has(key)) {
                  seen.add(key);
                  uniqueAgendas.push(a);
                }
              }

              if (uniqueAgendas.length === 0) return null;

              return (
                <div style={{ marginTop: '16px', padding: '14px 16px', backgroundColor: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px' }}>
                  <strong style={{ color: '#3b82f6', fontSize: '13px' }}>
                    📅 Agenda Penting & Hari Libur — {new Date(0, currentMonth - 1).toLocaleString('id-ID', { month: 'long' })} {currentYear}
                  </strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '13px', color: 'var(--text-primary)', listStyleType: 'none', padding: 0 }}>
                    {uniqueAgendas.map(h => (
                      <li key={h.id || h._date + h.keterangan} style={{ margin: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '700', minWidth: '24px', color: 'var(--text-primary)' }}>{h._date.split('-')[2]}</span>
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', fontWeight: '600',
                          backgroundColor: h.jenis === 'agenda_penting' ? 'rgba(16,185,129,0.15)' : h.jenis === 'cuti_bersama' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.12)',
                          color: h.jenis === 'agenda_penting' ? '#059669' : h.jenis === 'cuti_bersama' ? '#ca8a04' : '#ef4444'
                        }}>
                          {h.jenis === 'agenda_penting' ? 'Agenda Penting' : h.jenis === 'cuti_bersama' ? 'Cuti Bersama' : 'Libur Nasional'}
                        </span>
                        <span style={{ flex: 1 }}>{h.keterangan}</span>
                        {(h.sumber === 'manual' || h.jenis === 'agenda_penting') && h.id && (
                          <button
                            onClick={async () => {
                              if (!window.confirm('Hapus agenda ini?')) return;
                              if (h.jenis === 'agenda_penting') await deleteSpecialSchedule(h.id);
                              else await deleteHoliday(h.id);
                              setAgendaTrigger(prev => prev + 1);
                            }}
                            className="btn btn--icon btn--delete"
                            style={{ color: '#ef4444', padding: '2px 4px' }}
                            title="Hapus Agenda Manual"
                          >
                            <LuTrash2 size={14} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Modal Tambah Peserta */}
      {isAddPartModalOpen && (
        <Modal isOpen={isAddPartModalOpen} onClose={() => setIsAddPartModalOpen(false)} title="Tambah Peserta ke Desa">
          <div className="form">
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Desa: <strong>{desaList.find(d => d.id === selectedDesa)?.name}</strong><br />
              Kecamatan: <strong>{KECAMATAN_DESA.find(k => k.id === selectedKecamatan)?.name}</strong>
            </p>
            <div className="form-group">
              <label>Pilih Peserta Magang</label>
              <select
                value={selectedUserToAdd}
                onChange={e => setSelectedUserToAdd(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              >
                <option value="">-- Pilih Peserta --</option>
                {availableUsersForAdd.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.division})</option>
                ))}
              </select>
              {availableUsersForAdd.length === 0 && (
                <p style={{ fontSize: '12px', color: '#f59e0b', marginTop: '6px' }}>Semua peserta sudah ditempatkan di desa lain.</p>
              )}
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn--secondary" onClick={() => setIsAddPartModalOpen(false)}>Batal</button>
              <button className="btn btn--primary" onClick={confirmAddParticipant} disabled={!selectedUserToAdd}>Simpan</button>
            </div>
          </div>
        </Modal>
      )}
      {/* Modal Tambah Agenda */}
      {isAgendaModalOpen && (
        <Modal isOpen={isAgendaModalOpen} onClose={() => setIsAgendaModalOpen(false)} title="Tambah Agenda Hari">
          <div className="form">
            <div className="form-group">
              <label>Tanggal</label>
              <input
                type="date"
                value={agendaForm.tanggal}
                onChange={e => setAgendaForm({ ...agendaForm, tanggal: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div className="form-group">
              <label>Jenis Agenda</label>
              <select
                value={agendaForm.jenis}
                onChange={e => setAgendaForm({ ...agendaForm, jenis: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              >
                <option value="agenda_penting">Agenda Penting (Tidak Libur)</option>
                <option value="libur_nasional">Libur Nasional</option>
                <option value="cuti_bersama">Cuti Bersama</option>
              </select>
            </div>
            <div className="form-group">
              <label>Keterangan</label>
              <input
                type="text"
                value={agendaForm.keterangan}
                onChange={e => setAgendaForm({ ...agendaForm, keterangan: e.target.value })}
                placeholder="Cth: Rapat Paripurna, Libur Pilkada..."
                style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn--secondary" onClick={() => setIsAgendaModalOpen(false)}>Batal</button>
              <button className="btn btn--primary" onClick={handleSaveAgenda} disabled={!agendaForm.tanggal || !agendaForm.keterangan}>Simpan</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
