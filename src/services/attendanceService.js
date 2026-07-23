import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  orderBy,
  Timestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const ATTENDANCE_COLLECTION = 'attendance_logs';

// Konfigurasi jam kerja
const WORK_SCHEDULE = {
  checkInDeadline: { hour: 7, minute: 30 }, // Batas jam masuk (07:30)
  checkOutTime: {
    default: { hour: 16, minute: 0 },  // Senin-Kamis: 16:00
    friday: { hour: 14, minute: 30 },   // Jumat: 14:30
  },
  offDays: [0, 6], // 0 = Minggu, 6 = Sabtu
};

export const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isOffDay = (date = new Date()) => {
  return WORK_SCHEDULE.offDays.includes(date.getDay());
};

export const isFriday = (date = new Date()) => {
  return date.getDay() === 5;
};

export const determineStatus = (checkInTime) => {
  const deadline = WORK_SCHEDULE.checkInDeadline;
  const hours = checkInTime.getHours();
  const minutes = checkInTime.getMinutes();

  if (hours < deadline.hour || (hours === deadline.hour && minutes <= deadline.minute)) {
    return 'Hadir';
  }
  return 'Terlambat';
};

export const subscribeToTodayAttendance = (callback) => {
  const today = getTodayDate();
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('date', '==', today),
    orderBy('checkIn', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const attendanceList = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      checkIn: doc.data().checkIn?.toDate?.() || null,
      checkOut: doc.data().checkOut?.toDate?.() || null,
    }));
    callback(attendanceList);
  });
};

export const getAttendanceByDate = async (date) => {
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('date', '==', date),
    orderBy('checkIn', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    checkIn: doc.data().checkIn?.toDate?.() || null,
    checkOut: doc.data().checkOut?.toDate?.() || null,
  }));
};

export const getAttendanceByDateRange = async (startDate, endDate) => {
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    checkIn: doc.data().checkIn?.toDate?.() || null,
    checkOut: doc.data().checkOut?.toDate?.() || null,
  }));
};

/**
 * Proses scan fingerprint — logika masuk/keluar otomatis
 */
export const processAttendanceScan = async (fingerprintId, userName = 'Unknown', division = '') => {
  const now = new Date();
  const today = getTodayDate();

  // Cek hari libur
  if (isOffDay(now)) {
    return { success: false, message: 'Hari ini adalah hari libur (Sabtu/Minggu)' };
  }

  // Cek apakah sudah ada record hari ini untuk fingerprint ini
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('fingerprintId', '==', fingerprintId),
    where('date', '==', today)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    // Belum ada record → buat record baru (CHECK IN)
    const status = determineStatus(now);
    const isAfternoon = now.getHours() >= 12;
    const finalStatus = status === 'Hadir' ? 'Hadir (KOMINFO)' : 'Terlambat (KOMINFO)';
    
    await addDoc(collection(db, ATTENDANCE_COLLECTION), {
      fingerprintId,
      userName,
      division,
      date: today,
      checkIn: Timestamp.fromDate(now),
      checkOut: isAfternoon ? Timestamp.fromDate(now) : null,
      status: finalStatus,
      location: 'kominfo'
    });
    
    return {
      success: true,
      type: 'checkIn',
      message: isAfternoon 
        ? `Absen masuk & keluar berhasil - ${finalStatus}`
        : `Absen masuk berhasil - ${finalStatus}`,
      status: finalStatus,
    };
  } else {
    // Sudah ada record
    const existingDoc = snapshot.docs[0];
    const existingData = existingDoc.data();

    if (existingData.checkOut) {
      // Sudah check-in dan check-out
      return {
        success: false,
        message: 'Anda sudah melakukan absen masuk dan keluar hari ini',
      };
    }

    // Cek apakah waktu sekarang sebelum jam 12:00
    if (now.getHours() < 12) {
      return {
        success: false,
        message: 'Absen keluar hanya diperbolehkan setelah jam 12:00 siang',
      };
    }

    // Update check-out
    await updateDoc(doc(db, ATTENDANCE_COLLECTION, existingDoc.id), {
      checkOut: Timestamp.fromDate(now),
      status: existingData.status.includes('Terlambat') ? 'Terlambat (KOMINFO)' : 'Hadir (KOMINFO)',
      location: 'kominfo'
    });

    return {
      success: true,
      type: 'checkOut',
      message: 'Absen keluar berhasil',
    };
  }
};

export const confirmSidediAttendance = async (fingerprintId, userName, division = '', progress = 0) => {
  const today = getTodayDate();

  // Set default checkIn (07:00) and checkOut (16:00) for Sidedi attendance
  const checkInTime = new Date();
  checkInTime.setHours(7, 0, 0, 0);
  
  const checkOutTime = new Date();
  checkOutTime.setHours(16, 0, 0, 0);

  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('fingerprintId', '==', Number(fingerprintId)),
    where('date', '==', today)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    await addDoc(collection(db, ATTENDANCE_COLLECTION), {
      fingerprintId: Number(fingerprintId),
      userName,
      division,
      date: today,
      checkIn: Timestamp.fromDate(checkInTime),
      checkOut: Timestamp.fromDate(checkOutTime),
      status: 'Hadir (SIDEDI)',
      location: 'sidedi',
      progress: Number(progress)
    });
    return { success: true, message: 'Kehadiran SIDEDI dikonfirmasi' };
  } else {
    return { success: false, message: 'Peserta sudah absen hari ini.' };
  }
};

export const getAttendanceByFingerprintId = async (fingerprintId) => {
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('fingerprintId', '==', Number(fingerprintId))
  );

  const snapshot = await getDocs(q);
  const logs = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    checkIn: doc.data().checkIn?.toDate?.() || null,
    checkOut: doc.data().checkOut?.toDate?.() || null,
  }));

  // Urutkan berdasarkan tanggal terbaru di atas di dalam memori
  return logs.sort((a, b) => b.date.localeCompare(a.date));
};

export const deleteAttendanceLog = async (logId) => {
  await deleteDoc(doc(db, ATTENDANCE_COLLECTION, logId));
  return { id: logId };
};

export const deleteAttendanceByFingerprintId = async (fingerprintId) => {
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('fingerprintId', '==', Number(fingerprintId))
  );
  const snapshot = await getDocs(q);
  for (const logDoc of snapshot.docs) {
    await deleteDoc(doc(db, ATTENDANCE_COLLECTION, logDoc.id));
  }
  return { deletedCount: snapshot.docs.length };
};

export const deleteAllAttendanceLogs = async () => {
  const snapshot = await getDocs(collection(db, ATTENDANCE_COLLECTION));
  for (const logDoc of snapshot.docs) {
    await deleteDoc(doc(db, ATTENDANCE_COLLECTION, logDoc.id));
  }
  return { deletedCount: snapshot.docs.length };
};

/**
 * Memberikan izin absensi untuk peserta magang.
 * Tipe izin:
 *   - 'S' = Sakit
 *   - 'K' = Panggilan Sekolah/Kampus
 *   - 'I' = Lainnya (Izin umum)
 *
 * @param {number} fingerprintId - ID sidik jari peserta
 * @param {string} userName - Nama peserta
 * @param {string} division - Divisi peserta
 * @param {string} leaveType - Kode tipe izin ('S', 'K', atau 'I')
 * @param {string} leaveNote - Keterangan/alasan izin
 * @returns {{ success: boolean, message: string }}
 */
export const submitLeavePermission = async (fingerprintId, userName, division = '', leaveType, leaveNote = '') => {
  const today = getTodayDate();

  // Cek apakah peserta sudah memiliki record hari ini
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('fingerprintId', '==', Number(fingerprintId)),
    where('date', '==', today)
  );

  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    return { success: false, message: 'Peserta sudah memiliki catatan absensi hari ini.' };
  }

  const leaveLabels = {
    'S': 'Sakit',
    'K': 'Panggilan Sekolah/Kampus',
    'I': 'Izin Lainnya',
  };

  const statusLabel = leaveLabels[leaveType] || 'Izin';

  await addDoc(collection(db, ATTENDANCE_COLLECTION), {
    fingerprintId: Number(fingerprintId),
    userName,
    division,
    date: today,
    checkIn: null,
    checkOut: null,
    status: `Izin (${leaveType})`,
    location: 'izin',
    leaveType,
    leaveNote,
  });

  return { success: true, message: `Izin ${statusLabel} berhasil dicatat untuk ${userName}.` };
};

