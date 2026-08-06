import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const SIDEDI_COLLECTION = 'sidedi_locations';
const SCHEDULES_COLLECTION = 'schedules';
const ATTENDANCE_COLLECTION = 'attendance_logs';

// --- MANAJEMEN ANGGOTA DESA ---
// Ambil semua data lokasi sidedi dari Firestore (hanya participantIds)
export const getAllSidediLocations = async () => {
  const snapshot = await getDocs(collection(db, SIDEDI_COLLECTION));
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
};

// Pastikan dokumen desa ada di Firestore (berdasarkan ID hardcoded)
// Jika belum ada, buat dengan participantIds kosong
export const ensureDesaExists = async (desaId, desaName, kecamatanId, kecamatanName) => {
  const docRef = doc(db, SIDEDI_COLLECTION, desaId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    await writeBatch(db)
      .set(docRef, {
        name: desaName,
        kecamatanId,
        kecamatanName,
        participantIds: [],
        createdAt: Timestamp.fromDate(new Date()),
      })
      .commit();
  }
  return { id: desaId, name: desaName, kecamatanId, kecamatanName };
};

// Tambahkan peserta ke desa (hapus dari desa lain terlebih dahulu)
export const addParticipantToSidedi = async (desaId, userId) => {
  // Hapus peserta dari desa lain jika sudah terdaftar
  const allLocations = await getAllSidediLocations();
  const batch = writeBatch(db);
  for (const loc of allLocations) {
    if (loc.participantIds && loc.participantIds.includes(userId)) {
      batch.update(doc(db, SIDEDI_COLLECTION, loc.id), {
        participantIds: arrayRemove(userId),
      });
    }
  }
  await batch.commit();

  // Tambahkan ke desa baru
  await updateDoc(doc(db, SIDEDI_COLLECTION, desaId), {
    participantIds: arrayUnion(userId),
  });
  return { success: true };
};

export const removeParticipantFromSidedi = async (desaId, userId) => {
  await updateDoc(doc(db, SIDEDI_COLLECTION, desaId), {
    participantIds: arrayRemove(userId),
  });
  return { success: true };
};

// --- PENJADWALAN ---
export const saveSchedule = async (userId, userName, date, location) => {
  const q = query(
    collection(db, SCHEDULES_COLLECTION),
    where('userId', '==', userId),
    where('date', '==', date)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    const docRef = await addDoc(collection(db, SCHEDULES_COLLECTION), {
      userId,
      userName,
      date,
      location,
      updatedAt: Timestamp.fromDate(new Date()),
    });
    return { id: docRef.id, userId, userName, date, location };
  } else {
    const scheduleId = snapshot.docs[0].id;
    await updateDoc(doc(db, SCHEDULES_COLLECTION, scheduleId), {
      location,
      updatedAt: Timestamp.fromDate(new Date()),
    });
    return { id: scheduleId, userId, userName, date, location };
  }
};

export const getSchedulesByDateRange = async (startDate, endDate) => {
  const q = query(
    collection(db, SCHEDULES_COLLECTION),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
};

export const getTodaySchedules = async (date) => {
  const q = query(
    collection(db, SCHEDULES_COLLECTION),
    where('date', '==', date)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
};

// --- KONFIRMASI KEHADIRAN MANUAL SIDEDI ---
export const confirmSidediAttendance = async (userId, userName, date, fingerprintId = 0) => {
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('fingerprintId', '==', Number(fingerprintId || 0)),
    where('date', '==', date)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    const checkInTime = new Date(`${date}T08:00:00`);
    const checkOutTime = new Date(`${date}T16:00:00`);

    await addDoc(collection(db, ATTENDANCE_COLLECTION), {
      fingerprintId: Number(fingerprintId || 0),
      userName,
      date,
      checkIn: Timestamp.fromDate(checkInTime),
      checkOut: Timestamp.fromDate(checkOutTime),
      status: 'Hadir (SIDEDI)',
      location: 'sidedi',
    });
    return { success: true, message: 'Absensi SIDEDI berhasil dikonfirmasi' };
  } else {
    const attendanceId = snapshot.docs[0].id;
    await updateDoc(doc(db, ATTENDANCE_COLLECTION, attendanceId), {
      status: 'Hadir (SIDEDI)',
      location: 'sidedi',
    });
    return { success: true, message: 'Status absensi diperbarui ke SIDEDI' };
  }
};
