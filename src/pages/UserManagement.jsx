import { useState, useEffect } from 'react';
import { LuPlus, LuPencil, LuTrash2, LuSearch, LuFingerprint, LuPrinter, LuSettings, LuCheck, LuRefreshCw } from 'react-icons/lu';
import { addUserOnly, registerUserAndRequestEnroll, getAllUsers, updateUser, deleteUser, deleteAllUsers, getAllMajors, addMajor, deleteMajor, getAllAdvisors, addAdvisor, deleteAdvisor, completeInternship } from '../services/userService';
import { getAttendanceByFingerprintId } from '../services/attendanceService';
import { getAllSidediLocations } from '../services/sidediService';
import { publishEnrollRequest, publishDeleteRequest, publishClearAllRequest, registerDeleteResultCallback, unregisterDeleteResultCallback } from '../components/MqttListener';
import Modal from '../components/Modal';

const initialFormData = {
  name: '',
  institution: '',
  division: 'TIK',
  major: '',
  phone: '',
  socialMedia: '',
  advisor: '',
  no_hp_pembimbing: '',
  startDate: '',
  endDate: '',
};

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [editingId, setEditingId] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [isResetAllModalOpen, setIsResetAllModalOpen] = useState(false);
  const [resetAllLoading, setResetAllLoading] = useState(false);

  const [majors, setMajors] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [sidediLocations, setSidediLocations] = useState([]);

  // States for managing master data
  const [isManageMajorsOpen, setIsManageMajorsOpen] = useState(false);
  const [isManageAdvisorsOpen, setIsManageAdvisorsOpen] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchDropdownData();
  }, []);

  const fetchDropdownData = async () => {
    try {
      const majorsData = await getAllMajors();
      setMajors(majorsData);
      const advisorsData = await getAllAdvisors();
      setAdvisors(advisorsData);
      const sidediData = await getAllSidediLocations();
      setSidediLocations(sidediData);
    } catch (err) {
      console.error('Error fetching dropdown data:', err);
    }
  };

  // Auto-refresh daftar peserta tiap beberapa detik, supaya status enroll
  // (menunggu -> aktif) ter-update otomatis begitu ESP32 selesai proses
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsers();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const fetchUsers = async () => {
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoMsg('');

    // Validasi nomor HP Indonesia untuk pembimbing
    const phoneRegex = /^(?:\+62|62|0)8[1-9][0-9]{7,11}$/;
    if (!formData.no_hp_pembimbing) {
      setError('Nomor HP Pembimbing wajib diisi.');
      setLoading(false);
      return;
    }
    if (!phoneRegex.test(formData.no_hp_pembimbing.trim())) {
      setError('Format Nomor HP Pembimbing tidak valid (gunakan format Indonesia seperti 08xxxxxxxxxx atau +628xxxxxxxxxx)');
      setLoading(false);
      return;
    }

    try {
      const formattedData = {
        ...formData,
        no_hp_pembimbing: formData.no_hp_pembimbing.trim()
      };

      if (editingId) {
        // Edit data biasa - tidak menyentuh fingerprintId / proses enroll
        await updateUser(editingId, formattedData);
        setSuccessMsg('Data peserta berhasil diperbarui!');
        setIsModalOpen(false);
        setFormData(initialFormData);
        setEditingId(null);
        fetchUsers();
      } else {
        // Pendaftaran baru - simpan data saja, enroll fingerprint dilakukan terpisah
        await addUserOnly(formattedData);
        setSuccessMsg(`Data ${formData.name} berhasil disimpan! Lakukan pendaftaran fingerprint saat peserta sudah hadir.`);
        setIsModalOpen(false);
        setFormData(initialFormData);
        fetchUsers();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMajor = async () => {
    const name = window.prompt('Masukkan nama jurusan baru:');
    if (name && name.trim() !== '') {
      try {
        await addMajor(name.trim());
        fetchDropdownData();
      } catch (err) {
        alert('Gagal menambah jurusan: ' + err.message);
      }
    }
  };

  const handleDeleteMajor = async (id, majorName) => {
    const isUsed = users.some(u => u.major === majorName && u.isActive);
    let confirmMsg = 'Hapus jurusan ini?';
    if (isUsed) {
      confirmMsg = `Peringatan: Jurusan "${majorName}" masih digunakan oleh peserta aktif. Tetap hapus?`;
    }
    if (window.confirm(confirmMsg)) {
      try {
        await deleteMajor(id);
        fetchDropdownData();
      } catch (err) {
        alert('Gagal menghapus jurusan: ' + err.message);
      }
    }
  };

  const handleAddAdvisor = async () => {
    const name = window.prompt('Masukkan nama pembimbing baru:');
    if (name && name.trim() !== '') {
      try {
        await addAdvisor(name.trim());
        fetchDropdownData();
      } catch (err) {
        alert('Gagal menambah pembimbing: ' + err.message);
      }
    }
  };

  const handleDeleteAdvisor = async (id, advisorName) => {
    const isUsed = users.some(u => u.advisor === advisorName && u.isActive);
    let confirmMsg = 'Hapus pembimbing ini?';
    if (isUsed) {
      confirmMsg = `Peringatan: Pembimbing "${advisorName}" masih digunakan oleh peserta aktif. Tetap hapus?`;
    }
    if (window.confirm(confirmMsg)) {
      try {
        await deleteAdvisor(id);
        fetchDropdownData();
      } catch (err) {
        alert('Gagal menghapus pembimbing: ' + err.message);
      }
    }
  };

  const canConfirmCompletion = (endDateStr) => {
    if (!endDateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(endDateStr + 'T00:00:00');
    endDate.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= -7 && diffDays <= 7;
  };

  const handleCompleteInternship = async (user) => {
    if (window.confirm(`Apakah Anda yakin ingin mengonfirmasi selesai magang untuk "${user.name}"? Data peserta akan diarsip dan sidik jari akan dihapus dari sensor.`)) {
      try {
        const result = await completeInternship(user.id);
        if (result.success) {
          if (result.fingerprintId) {
            publishDeleteRequest(result.fingerprintId);
          }
          alert(`Kehadiran magang selesai untuk "${result.name}" berhasil dikonfirmasi. Sidik jari telah dihapus.`);
          fetchUsers();
        }
      } catch (err) {
        alert('Gagal mengonfirmasi selesai magang: ' + err.message);
      }
    }
  };

  // Daftarkan fingerprint untuk peserta yang statusnya 'belum_enroll'.
  // Ubah status ke 'menunggu_enroll' lalu kirim MQTT enroll_request ke ESP32.
  const handleEnrollFingerprint = async (user) => {
    if (!window.confirm(`Daftarkan fingerprint untuk "${user.name}"?\n\nPastikan peserta sudah hadir dan siap menempelkan jari di alat fingerprint.`)) return;
    try {
      await updateUser(user.id, { status: 'menunggu_enroll', fingerprintId: null });
      const terkirim = publishEnrollRequest(user.id, user.name);
      if (terkirim) {
        setSuccessMsg(`Permintaan enroll untuk ${user.name} berhasil dikirim!`);
        setInfoMsg(`Silakan minta ${user.name} menempelkan jari di alat fingerprint sekarang.`);
      } else {
        setSuccessMsg(`Status ${user.name} diubah ke "Menunggu Enroll".`);
        setInfoMsg('Alat fingerprint belum terhubung. Pastikan alat menyala dan terhubung internet, lalu coba lagi.');
      }
      fetchUsers();
    } catch (err) {
      setError('Gagal memulai enroll: ' + err.message);
    }
  };

  // Kirim ulang permintaan enroll untuk peserta yang gagal enroll sebelumnya.
  // Status direset ke 'menunggu_enroll' dan fingerprintId dikosongkan,
  // lalu MQTT enroll_request dikirim ulang ke ESP32.
  const handleRetryEnroll = async (user) => {
    if (!window.confirm(`Kirim ulang permintaan enroll untuk "${user.name}"?\n\nPastikan peserta siap menempelkan jari di alat fingerprint.`)) return;
    try {
      await updateUser(user.id, { status: 'menunggu_enroll', fingerprintId: null });
      const terkirim = publishEnrollRequest(user.id, user.name);
      if (terkirim) {
        setSuccessMsg(`Permintaan enroll ulang untuk ${user.name} berhasil dikirim!`);
        setInfoMsg(`Silakan tempelkan jari ${user.name} di alat fingerprint sekarang untuk menyelesaikan pendaftaran.`);
      } else {
        setSuccessMsg(`Status ${user.name} direset ke "Menunggu Enroll".`);
        setInfoMsg('Alat fingerprint belum terhubung. Pastikan alat menyala dan terhubung internet, lalu coba lagi.');
      }
      fetchUsers();
    } catch (err) {
      setError('Gagal mengirim enroll ulang: ' + err.message);
    }
  };

  const handleEdit = (user) => {
    setFormData({
      name: user.name || '',
      institution: user.institution || '',
      division: user.division || 'TIK',
      major: user.major || '',
      phone: user.phone || '',
      socialMedia: user.socialMedia || '',
      advisor: user.advisor || '',
      no_hp_pembimbing: user.no_hp_pembimbing || '',
      startDate: user.startDate || '',
      endDate: user.endDate || '',
    });
    setEditingId(user.id);
    setError('');
    setIsModalOpen(true);
  };

  const handleDelete = (user) => {
    setDeletingUser(user);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;

    // Jika user belum enroll (fingerprintId null) — langsung hapus Firestore
    if (!deletingUser.fingerprintId) {
      try {
        await deleteUser(deletingUser.id);
        setSuccessMsg(`Peserta ${deletingUser.name} berhasil dihapus!`);
        setIsDeleteModalOpen(false);
        setDeletingUser(null);
        fetchUsers();
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    // User punya fingerprintId — kirim delete_request ke sensor dulu
    setDeleteLoading(true);
    setError('');

    const terkirim = publishDeleteRequest(deletingUser.fingerprintId);
    if (!terkirim) {
      // Sensor tidak terhubung — langsung hapus Firestore dengan peringatan
      try {
        await deleteUser(deletingUser.id);
        setSuccessMsg(`Peserta ${deletingUser.name} berhasil dihapus dari sistem.`);
        setError('Peringatan: alat tidak terhubung. Template sidik jari di sensor mungkin belum terhapus, perlu dihapus manual.');
        setIsDeleteModalOpen(false);
        setDeletingUser(null);
        fetchUsers();
      } catch (err) {
        setError(err.message);
      } finally {
        setDeleteLoading(false);
      }
      return;
    }

    // Tunggu delete_result dari sensor, dengan timeout 10 detik
    const timeoutRef = { id: null, resolved: false };

    registerDeleteResultCallback(async (result) => {
      // Pastikan ini adalah respons untuk fingerprintId yang benar
      if (Number(result.fingerprintId) !== Number(deletingUser.fingerprintId)) return;
      // Cegah double-call jika timeout sudah resolve duluan
      if (timeoutRef.resolved) return;
      timeoutRef.resolved = true;

      clearTimeout(timeoutRef.id);
      unregisterDeleteResultCallback();

      if (result.success) {
        try {
          await deleteUser(deletingUser.id);
          setSuccessMsg(`Peserta ${deletingUser.name} berhasil dihapus dari sistem dan sensor.`);
          setIsDeleteModalOpen(false);
          setDeletingUser(null);
          fetchUsers();
        } catch (err) {
          setError(err.message);
        }
      } else {
        setError(`Gagal menghapus sidik jari dari sensor: ${result.error || 'Error tidak diketahui'}. Data sistem tetap ada.`);
      }
      setDeleteLoading(false);
    });

    timeoutRef.id = setTimeout(async () => {
      if (timeoutRef.resolved) return;
      timeoutRef.resolved = true;

      unregisterDeleteResultCallback();

      // Timeout — tetap hapus Firestore, tampilkan peringatan
      try {
        await deleteUser(deletingUser.id);
        setSuccessMsg(`Peserta ${deletingUser.name} berhasil dihapus dari sistem.`);
        setError('Peringatan: sensor tidak merespons dalam 10 detik. Template sidik jari di sensor mungkin belum terhapus dan perlu dihapus manual.');
        setIsDeleteModalOpen(false);
        setDeletingUser(null);
        fetchUsers();
      } catch (err) {
        setError(err.message);
      } finally {
        setDeleteLoading(false);
      }
    }, 10000);
  };

  const handleSelectUser = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUserIds.length === filteredUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map((u) => u.id));
    }
  };

  const handleBulkDelete = () => {
    setIsBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    setBulkDeleteLoading(true);
    setError('');

    const usersToDelete = users.filter((u) => selectedUserIds.includes(u.id));
    let successCount = 0;
    let failCount = 0;

    for (const user of usersToDelete) {
      try {
        if (user.fingerprintId) {
          // Kirim perintah delete ke alat
          publishDeleteRequest(user.fingerprintId);
          // Beri jeda kecil agar broker/alat tidak kepenuhan pesan MQTT
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        await deleteUser(user.id);
        successCount++;
      } catch (err) {
        console.error(`Gagal menghapus ${user.name}:`, err);
        failCount++;
      }
    }

    setSuccessMsg(`Berhasil menghapus ${successCount} peserta.`);
    if (failCount > 0) {
      setError(`Gagal menghapus ${failCount} peserta.`);
    }

    setSelectedUserIds([]);
    setIsBulkDeleteModalOpen(false);
    setBulkDeleteLoading(false);
    fetchUsers();
  };

  const openAddModal = () => {
    setFormData(initialFormData);
    setEditingId(null);
    setError('');
    setInfoMsg('');
    setIsModalOpen(true);
  };

  const handlePrintRecap = async (user) => {
    if (!user.fingerprintId) return;
    try {
      const data = await getAttendanceByFingerprintId(user.fingerprintId);
      
      let totalSidedi = 0;
      let totalKominfo = 0;
      let totalSidediWithProgress = 0;
      let sumSidediProgress = 0;
      
      data.forEach(item => {
         if (item.location === 'sidedi') {
            totalSidedi++;
            if (item.progress !== undefined && item.progress !== null) {
              totalSidediWithProgress++;
              sumSidediProgress += Number(item.progress);
            }
         }
         else if (item.status && item.status.includes('Hadir')) totalKominfo++;
      });
      
      const avgSidediProgress = totalSidediWithProgress > 0 
        ? Math.round(sumSidediProgress / totalSidediWithProgress) 
        : 0;
      
      let desaPlacement = '-';
      const userLocations = sidediLocations.filter(loc => loc.participantIds?.includes(user.id));
      if (userLocations.length > 0) {
         desaPlacement = userLocations.map(l => l.name).join(', ');
      }

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
            <title>Rekap Absensi - ${user.name}</title>
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
                font-size: 11px;
                font-style: italic;
                color: #666;
                align-self: flex-end;
              }
              .signature-section {
                text-align: center;
                width: 250px;
                font-size: 12px;
              }
              .signature-space {
                height: 80px;
              }
              @media print {
                button { display: none; }
              }
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
            <div class="kop-line" style="border-bottom: 3px solid #000;"></div>

            <div class="report-title">Laporan Rekapitulasi Absensi</div>
            
            <table class="info-table">
              <tr>
                <td class="label">Nama Peserta</td><td class="colon">:</td><td>${user.name}</td>
                <td class="label">ID Fingerprint</td><td class="colon">:</td><td>${getDisplayId(user.fingerprintId, user.division)}</td>
              </tr>
              <tr>
                <td class="label">Instansi Asal</td><td class="colon">:</td><td>${user.institution || '-'}</td>
                <td class="label">Divisi Penempatan</td><td class="colon">:</td><td>${user.division || '-'}</td>
              </tr>
              <tr>
                <td class="label">Jurusan</td><td class="colon">:</td><td>${user.major || '-'}</td>
                <td class="label">Pembimbing</td><td class="colon">:</td><td>${user.advisor || '-'}</td>
              </tr>
              <tr>
                <td class="label">Periode PKL</td><td class="colon">:</td><td>${user.startDate && user.endDate ? user.startDate + ' s/d ' + user.endDate : '-'}</td>
                <td class="label">Desa SIDEDI</td><td class="colon">:</td><td>${desaPlacement}</td>
              </tr>
            </table>

            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 30px;">No</th>
                  <th>Tanggal</th>
                  <th style="width: 75px;">Masuk</th>
                  <th style="width: 75px;">Keluar</th>
                  <th style="width: 70px;">Lokasi</th>
                  <th style="width: 100px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div class="summary-box">
              <strong>Ringkasan Kehadiran:</strong>
              • Total Hadir KOMINFO: ${totalKominfo} Hari<br/>
              • Total Hadir SIDEDI: ${totalSidedi} Hari<br/>
              • Rata-rata Progress Magang Desa (SIDEDI): ${avgSidediProgress}%
            </div>

            <div class="footer-section">
              <div class="print-date">Dicetak pada: ${today}</div>
              <div class="signature-section">
                <p>Temanggung, ${today}</p>
                <p>Pembimbing Lapangan,</p>
                <div class="signature-space"></div>
                <p style="text-decoration: underline; font-weight: bold;">${user.advisor && user.advisor !== '-' && user.advisor !== '' ? user.advisor : '( ___________________ )'}</p>
              </div>
            </div>

            <script>
              window.onload = function() {
                setTimeout(() => window.print(), 300);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Gagal mengambil data absen untuk rekap: ' + err.message);
    }
  };

  const handleResetAll = () => {
    setIsResetAllModalOpen(true);
  };

  const confirmResetAll = async () => {
    setResetAllLoading(true);
    setError('');

    try {
      // Kirim perintah clear ke sensor AS608 via MQTT
      const terkirim = publishClearAllRequest();

      // Hapus semua data peserta di Firestore
      const result = await deleteAllUsers();

      if (terkirim) {
        setSuccessMsg(`Berhasil menghapus ${result.deletedCount} peserta dari database dan mengirim perintah reset ke sensor.`);
      } else {
        setSuccessMsg(`Berhasil menghapus ${result.deletedCount} peserta dari database.`);
        setError('Peringatan: alat tidak terhubung. Data di sensor AS608 mungkin belum terhapus, perlu direset manual.');
      }

      setIsResetAllModalOpen(false);
      setSelectedUserIds([]);
      fetchUsers();
    } catch (err) {
      setError('Gagal menghapus data: ' + err.message);
    } finally {
      setResetAllLoading(false);
    }
  };

  const filteredUsers = users.filter((user) =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.institution?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(user.fingerprintId).includes(searchTerm)
  );

  const getDisplayId = (fingerprintId, division) => {
    if (!fingerprintId) return 'Belum Enroll';
    let prefix = division || 'USER';
    if (prefix === 'STATISTIK') prefix = 'Statistika';
    else if (prefix === 'SEKRETARIAT') prefix = 'Sekretariat';
    return `${prefix}${fingerprintId}`;
  };

  // Badge status enroll - membantu admin melihat peserta mana yang
  // masih menunggu proses tempel jari di alat
  const renderStatusEnroll = (user) => {
    if (user.status === 'aktif' || (user.fingerprintId && !user.status)) {
      return (
        <span className="badge badge--success">
          <LuFingerprint /> {getDisplayId(user.fingerprintId, user.division)}
        </span>
      );
    }
    if (user.status === 'gagal_enroll') {
      return (
        <span
          className="badge badge--danger"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleRetryEnroll(user)}
          title="Klik untuk kirim ulang permintaan enroll"
        >
          <LuRefreshCw style={{ marginRight: '4px', verticalAlign: 'middle' }} />
          Gagal Enroll — Klik Ulang
        </span>
      );
    }
    if (user.status === 'menunggu_enroll') {
      return <span className="badge badge--warning">Menunggu Tempel Jari</span>;
    }
    // belum_enroll (default untuk pendaftaran baru)
    return <span className="badge" style={{ backgroundColor: '#6b7280', color: 'white' }}>Belum Enroll</span>;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Manajemen Peserta</h1>
          <p className="page-subtitle">Kelola data peserta PKL / Magang / Kerja Praktik</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {users.length > 0 && (
            <button className="btn btn--danger" onClick={handleResetAll}>
              <LuTrash2 /> Hapus Semua
            </button>
          )}
          {selectedUserIds.length > 0 && (
            <button className="btn btn--danger" onClick={handleBulkDelete}>
              <LuTrash2 /> Hapus Terpilih ({selectedUserIds.length})
            </button>
          )}
          <button className="btn btn--primary" onClick={openAddModal}>
            <LuPlus /> Tambah Peserta
          </button>
        </div>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="alert alert--success">{successMsg}</div>
      )}

      {/* Info Message - instruksi tempel jari */}
      {infoMsg && (
        <div className="alert alert--info">
          <LuFingerprint /> {infoMsg}
        </div>
      )}

      {/* Search */}
      <div className="card">
        <div className="search-box">
          <LuSearch className="search-icon" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama, instansi, atau ID fingerprint..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="card-header">
          <h2>Daftar Peserta Terdaftar</h2>
          <span className="badge badge--info">{filteredUsers.length} peserta</span>
        </div>
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: '1500px' }}>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th>No</th>
                <th>Nama Peserta</th>
                <th>Instansi Asal</th>
                <th>Jurusan</th>
                <th>Pembimbing</th>
                <th>No. HP Pembimbing</th>
                <th>No. HP Peserta</th>
                <th>Divisi/Bagian</th>
                <th>Periode PKL</th>
                <th>Media Sosial</th>
                <th>Status Fingerprint</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="13" className="table-empty">
                    {searchTerm ? 'Tidak ada peserta yang sesuai pencarian' : 'Belum ada peserta terdaftar'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => (
                  <tr key={user.id} className="table-row-animate">
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => handleSelectUser(user.id)}
                      />
                    </td>
                    <td>{index + 1}</td>
                    <td className="td-name">{user.name}</td>
                    <td>{user.institution ? user.institution : <span className="badge badge--danger">-</span>}</td>
                    <td>{user.major ? user.major : <span className="badge badge--danger">-</span>}</td>
                    <td>{user.advisor ? user.advisor : <span className="badge badge--danger">Belum Diisi</span>}</td>
                    <td>{user.no_hp_pembimbing ? user.no_hp_pembimbing : <span className="badge badge--danger">Belum Diisi</span>}</td>
                    <td>{user.phone ? user.phone : <span className="badge badge--danger">-</span>}</td>
                    <td>{user.division ? user.division : <span className="badge badge--danger">-</span>}</td>
                    <td>
                      {user.startDate && user.endDate
                        ? `${user.startDate} s/d ${user.endDate}`
                        : <span className="badge badge--danger">-</span>}
                    </td>
                    <td>{user.socialMedia ? user.socialMedia : <span className="badge badge--danger">-</span>}</td>
                    <td>{renderStatusEnroll(user)}</td>
                    <td>
                      <div className="action-buttons">
                        {/* Tombol Daftarkan Fingerprint: hanya muncul jika belum enroll */}
                        {user.status === 'belum_enroll' && (
                          <button
                            className="btn btn--icon"
                            onClick={() => handleEnrollFingerprint(user)}
                            title="Daftarkan Fingerprint"
                            style={{ backgroundColor: '#8b5cf6', color: 'white' }}
                          >
                            <LuFingerprint />
                          </button>
                        )}
                        {user.status === 'gagal_enroll' && (
                          <button
                            className="btn btn--icon"
                            onClick={() => handleRetryEnroll(user)}
                            title="Enroll Ulang"
                            style={{ backgroundColor: '#f59e0b', color: 'white' }}
                          >
                            <LuRefreshCw />
                          </button>
                        )}
                        {canConfirmCompletion(user.endDate) && (
                          <button
                            className="btn btn--icon"
                            onClick={() => handleCompleteInternship(user)}
                            title="Konfirmasi Selesai Magang"
                            style={{ backgroundColor: '#3b82f6', color: 'white' }}
                          >
                            <LuCheck />
                          </button>
                        )}
                        {user.fingerprintId && (
                          <button
                            className="btn btn--icon"
                            onClick={() => handlePrintRecap(user)}
                            title="Cetak Rekap Absen"
                            style={{ backgroundColor: '#10b981', color: 'white' }}
                          >
                            <LuPrinter />
                          </button>
                        )}
                        <button
                          className="btn btn--icon btn--edit"
                          onClick={() => handleEdit(user)}
                          title="Edit"
                        >
                          <LuPencil />
                        </button>
                        <button
                          className="btn btn--icon btn--delete"
                          onClick={() => handleDelete(user)}
                          title="Hapus"
                        >
                          <LuTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Data Peserta' : 'Tambah Peserta Baru'}
      >
        <form onSubmit={handleSubmit} className="form">
          {error && <div className="alert alert--danger">{error}</div>}

          {!editingId && (
            <div className="alert alert--info">
              <LuFingerprint /> Data peserta akan disimpan terlebih dahulu. Pendaftaran fingerprint dapat dilakukan nanti melalui tombol <strong>🟣 Daftarkan Fingerprint</strong> di tabel, saat peserta sudah hadir.
            </div>
          )}

          <div className="form-group">
            <label htmlFor="name">Nama Peserta *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Masukkan nama lengkap"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="institution">Instansi Asal</label>
            <input
              type="text"
              id="institution"
              name="institution"
              value={formData.institution}
              onChange={handleInputChange}
              placeholder="Nama kampus/sekolah"
            />
          </div>

          <div className="form-group">
            <label htmlFor="division">Divisi/Bagian</label>
            <select
              id="division"
              name="division"
              value={formData.division}
              onChange={handleInputChange}
              required
            >
              <option value="TIK">TIK</option>
              <option value="STATISTIK">STATISTIK</option>
              <option value="IKP">IKP</option>
              <option value="SEKRETARIAT">SEKRETARIAT</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="major">Jurusan</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                id="major"
                name="major"
                value={formData.major}
                onChange={handleInputChange}
                style={{ flex: 1 }}
              >
                <option value="">-- Pilih Jurusan --</option>
                {majors.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
              <button type="button" className="btn btn--icon" onClick={handleAddMajor} title="Tambah Jurusan" style={{ backgroundColor: '#10b981', color: 'white' }}><LuPlus /></button>
              <button type="button" className="btn btn--icon" onClick={() => setIsManageMajorsOpen(true)} title="Kelola Jurusan" style={{ backgroundColor: '#6366f1', color: 'white' }}><LuSettings /></button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="phone">No HP</label>
              <input type="text" id="phone" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="08..." />
            </div>
            <div className="form-group">
              <label htmlFor="socialMedia">Media Sosial (Opsional)</label>
              <input type="text" id="socialMedia" name="socialMedia" value={formData.socialMedia} onChange={handleInputChange} placeholder="@username" />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="advisor">Pembimbing</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                id="advisor"
                name="advisor"
                value={formData.advisor}
                onChange={handleInputChange}
                style={{ flex: 1 }}
              >
                <option value="">-- Pilih Pembimbing --</option>
                {advisors.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
              <button type="button" className="btn btn--icon" onClick={handleAddAdvisor} title="Tambah Pembimbing" style={{ backgroundColor: '#10b981', color: 'white' }}><LuPlus /></button>
              <button type="button" className="btn btn--icon" onClick={() => setIsManageAdvisorsOpen(true)} title="Kelola Pembimbing" style={{ backgroundColor: '#6366f1', color: 'white' }}><LuSettings /></button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="no_hp_pembimbing">No HP Pembimbing *</label>
            <input
              type="text"
              id="no_hp_pembimbing"
              name="no_hp_pembimbing"
              value={formData.no_hp_pembimbing}
              onChange={handleInputChange}
              placeholder="Masukkan No HP Pembimbing (mis. 08123456789)"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">Tanggal Mulai</label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={formData.startDate}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="endDate">Tanggal Selesai</label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                value={formData.endDate}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn--secondary" onClick={() => setIsModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Menyimpan...' : editingId ? 'Perbarui' : 'Simpan Data'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Konfirmasi Hapus"
      >
        <div className="delete-confirm">
          <p>
            Apakah Anda yakin ingin menghapus peserta <strong>{deletingUser?.name}</strong>
            {deletingUser?.fingerprintId ? ` (Fingerprint #${deletingUser.fingerprintId})` : ''}?
          </p>
          <p className="text-muted">
            Tindakan ini tidak dapat dibatalkan. Data peserta akan dihapus dari Firebase dan sidik jarinya akan dihapus dari sensor AS608. Jika ESP32 sedang reboot, perintah hapus tetap tersimpan dan akan diproses otomatis saat alat menyala kembali.
          </p>
          <div className="form-actions">
            <button
              className="btn btn--secondary"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleteLoading}
            >
              Batal
            </button>
            <button
              className="btn btn--danger"
              onClick={confirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Menghapus...' : 'Hapus'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Bulk Delete Confirmation Modal */}
      <Modal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        title="Konfirmasi Hapus Terpilih"
      >
        <div className="delete-confirm">
          <p>
            Apakah Anda yakin ingin menghapus <strong>{selectedUserIds.length} peserta</strong> yang Anda pilih?
          </p>
          <p className="text-muted">
            Data peserta terpilih akan dihapus dari Firebase dan sidik jari mereka akan dihapus dari sensor AS608. Slot ID yang dikosongkan dapat langsung dipakai oleh pendaftar baru.
          </p>
          <div className="form-actions">
            <button
              className="btn btn--secondary"
              onClick={() => setIsBulkDeleteModalOpen(false)}
              disabled={bulkDeleteLoading}
            >
              Batal
            </button>
            <button
              className="btn btn--danger"
              onClick={confirmBulkDelete}
              disabled={bulkDeleteLoading}
            >
              {bulkDeleteLoading ? 'Menghapus...' : 'Hapus Terpilih'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reset All Confirmation Modal */}
      <Modal
        isOpen={isResetAllModalOpen}
        onClose={() => setIsResetAllModalOpen(false)}
        title="⚠️ Konfirmasi Hapus Semua"
      >
        <div className="delete-confirm">
          <p style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.05rem' }}>
            <LuTrash2 /> PERINGATAN: Tindakan ini tidak dapat dibatalkan!
          </p>
          <p>
            Anda akan menghapus <strong>seluruh {users.length} peserta</strong> dari sistem.
            Tindakan ini akan:
          </p>
          <ul style={{ textAlign: 'left', margin: '12px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
            <li>Menghapus semua data peserta dari database</li>
            <li>Mengirim perintah ke alat untuk menghapus seluruh sidik jari di sensor AS608</li>
            <li>Mereset ID fingerprint sehingga pendaftaran baru dimulai dari ID 1</li>
          </ul>
          <p className="text-muted">
            Perintah hapus sensor dikirim dengan sistem <em>retained MQTT</em> — jika ESP32 sedang reboot, perintah tetap tersimpan dan sensor akan ikut terhapus otomatis saat alat menyala kembali.
          </p>
          <div className="form-actions">
            <button
              className="btn btn--secondary"
              onClick={() => setIsResetAllModalOpen(false)}
              disabled={resetAllLoading}
            >
              Batal
            </button>
            <button
              className="btn btn--danger"
              onClick={confirmResetAll}
              disabled={resetAllLoading}
            >
              {resetAllLoading ? 'Mereset...' : 'Ya, Hapus Semua'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Manage Majors Modal */}
      <Modal
        isOpen={isManageMajorsOpen}
        onClose={() => setIsManageMajorsOpen(false)}
        title="Kelola Jurusan"
      >
        <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
          {majors.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '20px' }}>Belum ada data jurusan.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {majors.map((m) => (
                <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-color, #eee)' }}>
                  <span>{m.name}</span>
                  <button
                    className="btn btn--icon btn--delete"
                    onClick={() => handleDeleteMajor(m.id, m.name)}
                    title="Hapus Jurusan"
                    style={{ padding: '4px', height: 'auto', minWidth: 'auto' }}
                  >
                    <LuTrash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="form-actions">
          <button className="btn btn--secondary" onClick={() => setIsManageMajorsOpen(false)}>
            Tutup
          </button>
          <button className="btn btn--primary" onClick={handleAddMajor}>
            <LuPlus style={{ marginRight: '5px' }} /> Tambah Jurusan Baru
          </button>
        </div>
      </Modal>

      {/* Manage Advisors Modal */}
      <Modal
        isOpen={isManageAdvisorsOpen}
        onClose={() => setIsManageAdvisorsOpen(false)}
        title="Kelola Pembimbing"
      >
        <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
          {advisors.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '20px' }}>Belum ada data pembimbing.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {advisors.map((a) => (
                <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-color, #eee)' }}>
                  <span>{a.name}</span>
                  <button
                    className="btn btn--icon btn--delete"
                    onClick={() => handleDeleteAdvisor(a.id, a.name)}
                    title="Hapus Pembimbing"
                    style={{ padding: '4px', height: 'auto', minWidth: 'auto' }}
                  >
                    <LuTrash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="form-actions">
          <button className="btn btn--secondary" onClick={() => setIsManageAdvisorsOpen(false)}>
            Tutup
          </button>
          <button className="btn btn--primary" onClick={handleAddAdvisor}>
            <LuPlus style={{ marginRight: '5px' }} /> Tambah Pembimbing Baru
          </button>
        </div>
      </Modal>
    </div>
  );
}