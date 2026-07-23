import { useState, useEffect } from 'react';
import { LuPlus, LuTrash2, LuCalendarDays, LuMapPin, LuUsers, LuSave, LuChevronDown, LuChevronRight, LuPrinter } from 'react-icons/lu';
import { 
  getAllDistricts, addDistrict, deleteDistrict,
  getAllSidediLocations, addSidediLocation, deleteSidediLocation, 
  addParticipantToSidedi, removeParticipantFromSidedi,
  saveSchedule, getSchedulesByDateRange
} from '../services/sidediService';
import { getAllUsers } from '../services/userService';
import Modal from '../components/Modal';

export default function SidediInternship() {
  const [activeTab, setActiveTab] = useState('management'); // 'management' or 'schedule'
  
  // States for Management Tab
  const [districts, setDistricts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [expandedDistricts, setExpandedDistricts] = useState({});
  const [expandedLocations, setExpandedLocations] = useState({});
  
  // States for Schedule Tab
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [schedules, setSchedules] = useState({}); // { "userId_YYYY-MM-DD": "sidedi" | "kominfo" }
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // States for Add Participant Modal
  const [isAddPartModalOpen, setIsAddPartModalOpen] = useState(false);
  const [activeLocationIdForAdd, setActiveLocationIdForAdd] = useState(null);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'schedule') {
      fetchSchedules();
    }
  }, [activeTab, currentMonth, currentYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [districtsData, locsData, usersData] = await Promise.all([
        getAllDistricts(),
        getAllSidediLocations(),
        getAllUsers()
      ]);
      setDistricts(districtsData);
      setLocations(locsData);
      setUsers(usersData);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil data SIDEDI');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedules = async () => {
    try {
      const monthStr = currentMonth.toString().padStart(2, '0');
      const startPrefix = `${currentYear}-${monthStr}-01`;
      const endPrefix = `${currentYear}-${monthStr}-31`;
      const schedData = await getSchedulesByDateRange(startPrefix, endPrefix);
      
      const schedMap = {};
      schedData.forEach(s => {
        schedMap[`${s.userId}_${s.date}`] = s.location;
      });
      setSchedules(schedMap);
    } catch (err) {
      console.error(err);
    }
  };

  // ---- MANAGEMENT ACTIONS ----
  const handleAddDistrict = async () => {
    const name = window.prompt('Masukkan nama Kecamatan baru:');
    if (name && name.trim()) {
      await addDistrict(name.trim());
      fetchData();
    }
  };

  const handleAddLocation = async (districtId) => {
    const name = window.prompt('Masukkan nama Desa baru:');
    if (name && name.trim()) {
      await addSidediLocation(name.trim(), districtId);
      fetchData();
    }
  };

  const handleAddParticipant = (locationId) => {
    setActiveLocationIdForAdd(locationId);
    setIsAddPartModalOpen(true);
  };

  const confirmAddParticipant = async () => {
    if (!selectedUserToAdd) return;
    try {
      await addParticipantToSidedi(activeLocationIdForAdd, selectedUserToAdd);
      setIsAddPartModalOpen(false);
      setSelectedUserToAdd('');
      fetchData();
    } catch (err) {
      alert('Gagal menambahkan peserta: ' + err.message);
    }
  };

  const toggleDistrict = (id) => {
    setExpandedDistricts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLocation = (id) => {
    setExpandedLocations(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ---- SCHEDULE ACTIONS ----
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayName = (year, month, day) => {
    const d = new Date(year, month - 1, day);
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    return days[d.getDay()];
  };

  const getDisplayId = (fingerprintId, division) => {
    if (!fingerprintId) return 'Belum Enroll';
    let prefix = division || 'USER';
    if (prefix === 'STATISTIK') prefix = 'Statistika';
    else if (prefix === 'SEKRETARIAT') prefix = 'Sekretariat';
    return `${prefix}${fingerprintId}`;
  };

  const getUserDesa = (userId) => {
    const loc = locations.find(l => l.participantIds?.includes(userId));
    return loc ? loc.name : '-';
  };

  const getUserDistrictAndDesa = (userId) => {
    const loc = locations.find(l => l.participantIds?.includes(userId));
    if (!loc) return { district: '-', desa: '-' };
    const dist = districts.find(d => d.id === loc.districtId);
    return { district: dist ? dist.name : '-', desa: loc.name };
  };

  // Get users who are assigned to ANY sidedi location
  const assignedUsersList = users.filter(u => 
    locations.some(loc => loc.participantIds?.includes(u.id))
  );

  const handleScheduleChange = (userId, day, value) => {
    const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const key = `${userId}_${dateStr}`;
    setSchedules(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveSchedules = async () => {
    setIsSavingSchedule(true);
    try {
      const updates = [];
      for (const key in schedules) {
        const [userId, date] = key.split('_');
        const user = users.find(u => u.id === userId);
        updates.push({
          userId,
          userName: user ? user.name : 'Unknown',
          date,
          location: schedules[key] // 'sidedi' or 'kominfo'
        });
      }
      
      // Save all in parallel (or a batched write in service)
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
            ${daysArray.map(day => `<th>${day}<br/><span class="text-xs">${getDayName(currentYear, currentMonth, day)}</span></th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    if (assignedUsersList.length === 0) {
      tableHtml += `<tr><td colspan="${daysInMonth + 1}">Belum ada peserta.</td></tr>`;
    } else {
      assignedUsersList.forEach(user => {
        const { district } = getUserDistrictAndDesa(user.id);
        const displayId = getDisplayId(user.fingerprintId, user.division);
        tableHtml += `
          <tr>
            <td class="text-left">
              <strong>${user.name}</strong><br/>
              <span class="text-xs">ID: ${displayId} | No HP: ${user.phone || '-'}</span><br/>
              <span class="text-xs">${user.institution} - ${user.major || user.division}</span><br/>
              <span class="text-xs">Kec. ${district} - Desa: ${getUserDesa(user.id)}</span>
            </td>
        `;
        daysArray.forEach(day => {
          const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          const key = `${user.id}_${dateStr}`;
          const val = schedules[key];
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
        <strong>Keterangan:</strong> D = Desa (SIDEDI) | K = Kantor (KOMINFO)<br/>
        <em>Dicetak pada: ${new Date().toLocaleString('id-ID')}</em>
      </div>
    `;

    printWindow.document.write(`
      <html>
        <head><title>Cetak Rekap Penjadwalan</title></head>
        <body>
          ${tableHtml}
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="sidedi-page">
      <div className="page-header">
        <h1>Magang SIDEDI</h1>
        <p className="subtitle">Manajemen penempatan Desa dan Penjadwalan kehadiran</p>
      </div>

      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'management' ? 'active' : ''}`}
          onClick={() => setActiveTab('management')}
        >
          <LuMapPin /> Manajemen Desa
        </button>
        <button 
          className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          <LuCalendarDays /> Penjadwalan
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'management' && (
          <div className="management-tab card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Daftar Kecamatan & Desa</h2>
              <button className="btn btn--primary" onClick={handleAddDistrict}><LuPlus /> Tambah Kecamatan</button>
            </div>
            
            {loading ? <p>Memuat data...</p> : (
              <div className="district-list" style={{ marginTop: '20px' }}>
                {districts.map(district => (
                  <div key={district.id} className="district-item" style={{ marginBottom: '15px', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div 
                      className="district-header" 
                      onClick={() => toggleDistrict(district.id)}
                      style={{ padding: '15px', backgroundColor: 'var(--bg-input)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {expandedDistricts[district.id] ? <LuChevronDown /> : <LuChevronRight />}
                        Kecamatan {district.name}
                      </div>
                      <button className="btn btn--icon btn--delete" onClick={(e) => { e.stopPropagation(); deleteDistrict(district.id).then(fetchData); }}><LuTrash2 /></button>
                    </div>

                    {expandedDistricts[district.id] && (
                      <div className="district-body" style={{ padding: '15px', borderTop: '1px solid var(--border-color)' }}>
                        <button className="btn btn--secondary" onClick={() => handleAddLocation(district.id)} style={{ marginBottom: '15px' }}><LuPlus /> Tambah Desa</button>
                        
                        {locations.filter(l => l.districtId === district.id).map(loc => (
                          <div key={loc.id} className="location-item" style={{ marginLeft: '20px', marginBottom: '10px', borderLeft: '3px solid #10b981', paddingLeft: '15px' }}>
                            <div 
                              className="location-header"
                              onClick={() => toggleLocation(loc.id)}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {expandedLocations[loc.id] ? <LuChevronDown /> : <LuChevronRight />}
                                Desa {loc.name}
                              </div>
                              <button className="btn btn--icon btn--delete" onClick={(e) => { e.stopPropagation(); deleteSidediLocation(loc.id).then(fetchData); }}><LuTrash2 /></button>
                            </div>

                            {expandedLocations[loc.id] && (
                              <div className="location-body" style={{ marginTop: '10px', padding: '10px', backgroundColor: 'var(--bg-input)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Daftar Peserta:</span>
                                  <button className="btn btn--sm btn--primary" onClick={() => handleAddParticipant(loc.id)}><LuPlus /> Tambah Peserta</button>
                                </div>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                  {loc.participantIds && loc.participantIds.length > 0 ? (
                                    loc.participantIds.map(pId => {
                                      const u = users.find(user => user.id === pId);
                                      return (
                                        <li key={pId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid var(--border-color)', fontSize: '14px' }}>
                                          <span><LuUsers style={{ marginRight: '8px' }}/> {u ? u.name : 'Unknown'}</span>
                                          <button className="btn btn--icon" onClick={() => removeParticipantFromSidedi(loc.id, pId).then(fetchData)} style={{ color: 'red' }}><LuTrash2 /></button>
                                        </li>
                                      )
                                    })
                                  ) : (
                                    <li style={{ fontSize: '13px', color: '#6b7280' }}>Belum ada peserta di desa ini.</li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="schedule-tab card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2>Jadwal Penempatan</h2>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <select value={currentMonth} onChange={(e) => setCurrentMonth(parseInt(e.target.value))} className="month-select" style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}>
                  {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' })}</option>
                  ))}
                </select>
                <input 
                  type="number" 
                  value={currentYear} 
                  onChange={(e) => setCurrentYear(parseInt(e.target.value))}
                  style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
                <button className="btn btn--primary" onClick={handleSaveSchedules} disabled={isSavingSchedule}>
                  <LuSave /> {isSavingSchedule ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
                <button className="btn btn--secondary" onClick={handlePrintScheduleRecap}>
                  <LuPrinter /> Cetak Rekap
                </button>
              </div>
            </div>

            <div className="table-container" style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
              <table className="schedule-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '15px', borderBottom: '2px solid var(--border-color)', borderRight: '2px solid var(--border-color)', textAlign: 'left', minWidth: '250px', position: 'sticky', left: 0, backgroundColor: 'var(--bg-sidebar)', zIndex: 2, boxShadow: '4px 0 8px rgba(0,0,0,0.1)' }}>Data Peserta</th>
                    {daysArray.map(day => (
                      <th key={day} style={{ padding: '8px 4px', borderBottom: '2px solid var(--border-color)', borderRight: '1px solid var(--border-color)', textAlign: 'center', minWidth: '45px', fontSize: '12px' }}>
                        <div>{day}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>{getDayName(currentYear, currentMonth, day)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignedUsersList.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth + 1} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Belum ada peserta yang ditugaskan ke SIDEDI.</td>
                    </tr>
                  ) : (
                    assignedUsersList.map(user => (
                      <tr key={user.id} style={{ transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '10px 15px', borderBottom: '1px solid var(--border-color)', borderRight: '2px solid var(--border-color)', position: 'sticky', left: 0, backgroundColor: 'var(--bg-sidebar)', zIndex: 1, boxShadow: '4px 0 8px rgba(0,0,0,0.05)' }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>{user.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{user.institution} - {user.major || user.division}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-success-light)', marginTop: '2px' }}>Desa: {getUserDesa(user.id)} (Kec. {getUserDistrictAndDesa(user.id).district})</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>No HP: {user.phone || '-'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {getDisplayId(user.fingerprintId, user.division)}</div>
                        </td>
                        {daysArray.map(day => {
                          const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                          const key = `${user.id}_${dateStr}`;
                          const value = schedules[key] || '';
                          
                          return (
                            <td key={day} style={{ padding: '4px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', textAlign: 'center' }}>
                              <select 
                                value={value} 
                                onChange={(e) => handleScheduleChange(user.id, day, e.target.value)}
                                style={{ 
                                  padding: '4px', 
                                  border: 'none', 
                                  background: value === 'sidedi' ? 'rgba(16, 185, 129, 0.2)' : value === 'kominfo' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                  color: value === 'sidedi' ? 'var(--color-success)' : value === 'kominfo' ? 'var(--color-info)' : 'var(--text-secondary)',
                                  fontWeight: value ? 'bold' : 'normal',
                                  borderRadius: '4px',
                                  width: '100%',
                                  cursor: 'pointer',
                                  appearance: 'none',
                                  textAlign: 'center'
                                }}
                                title={value === 'sidedi' ? 'Desa' : value === 'kominfo' ? 'Kantor' : 'Pilih'}
                              >
                                <option value="" style={{ color: '#000' }}>-</option>
                                <option value="sidedi" style={{ color: '#000' }}>D</option>
                                <option value="kominfo" style={{ color: '#000' }}>K</option>
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '15px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>Keterangan:</strong> <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>D</span> = Desa (SIDEDI), <span style={{ color: 'var(--color-info)', fontWeight: 'bold' }}>K</span> = Kantor (KOMINFO)
            </div>
          </div>
        )}
      </div>

      {/* Modal Tambah Peserta Sidedi */}
      {isAddPartModalOpen && (
        <Modal
          isOpen={isAddPartModalOpen}
          onClose={() => setIsAddPartModalOpen(false)}
          title="Tambah Peserta ke Desa"
        >
          <div className="form">
            <div className="form-group">
              <label>Pilih Peserta Magang</label>
              <select 
                value={selectedUserToAdd} 
                onChange={(e) => setSelectedUserToAdd(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              >
                <option value="">-- Pilih Peserta --</option>
                {(() => {
                  const assignedUserIds = locations.reduce((acc, loc) => {
                    return acc.concat(loc.participantIds || []);
                  }, []);
                  const availableUsers = users.filter(u => !assignedUserIds.includes(u.id));
                  return availableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.division})
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn--secondary" onClick={() => setIsAddPartModalOpen(false)}>Batal</button>
              <button className="btn btn--primary" onClick={confirmAddParticipant} disabled={!selectedUserToAdd}>
                Simpan
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
