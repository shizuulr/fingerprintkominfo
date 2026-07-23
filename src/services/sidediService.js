import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const DISTRICTS_COLLECTION = 'districts';
const SIDEDI_COLLECTION = 'sidedi_locations';
const SCHEDULES_COLLECTION = 'schedules';
const ATTENDANCE_COLLECTION = 'attendance_logs';

// --- CRUD KECAMATAN (DISTRICTS) ---
export const addDistrict = async (name) => {
  const docRef = await addDoc(collection(db, DISTRICTS_COLLECTION), {
    name,
    createdAt: Timestamp.fromDate(new Date()),
  });
  return { id: docRef.id, name };
};

export const getAllDistricts = async () => {
  const q = query(collection(db, DISTRICTS_COLLECTION), orderBy('name', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const deleteDistrict = async (districtId) => {
  // Sebelum menghapus kecamatan, pastikan tidak ada desa di bawahnya yang masih bergantung
  const q = query(collection(db, SIDEDI_COLLECTION), where('districtId', '==', districtId));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    throw new Error('Tidak dapat menghapus kecamatan karena masih memiliki desa di dalamnya.');
  }
  await deleteDoc(doc(db, DISTRICTS_COLLECTION, districtId));
  return { id: districtId };
};

// --- CRUD DESA (SIDEDI_LOCATIONS) ---
export const addSidediLocation = async (name, districtId) => {
  const docRef = await addDoc(collection(db, SIDEDI_COLLECTION), {
    name,
    districtId,
    createdAt: Timestamp.fromDate(new Date()),
    participantIds: [],
  });
  return { id: docRef.id, name, districtId, participantIds: [] };
};

export const getAllSidediLocations = async () => {
  const snapshot = await getDocs(collection(db, SIDEDI_COLLECTION));
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const deleteSidediLocation = async (locationId) => {
  await deleteDoc(doc(db, SIDEDI_COLLECTION, locationId));
  return { id: locationId };
};

// --- MANAJEMEN ANGGOTA DESA ---
export const addParticipantToSidedi = async (locationId, userId) => {
  // Hapus peserta dari desa lain terlebih dahulu jika terdaftar
  const allLocations = await getAllSidediLocations();
  for (const locItem of allLocations) {
    if (locItem.participantIds && locItem.participantIds.includes(userId)) {
      await updateDoc(doc(db, SIDEDI_COLLECTION, locItem.id), {
        participantIds: arrayRemove(userId)
      });
    }
  }

  // Tambahkan peserta ke desa baru
  await updateDoc(doc(db, SIDEDI_COLLECTION, locationId), {
    participantIds: arrayUnion(userId)
  });
  return { success: true };
};

export const removeParticipantFromSidedi = async (locationId, userId) => {
  await updateDoc(doc(db, SIDEDI_COLLECTION, locationId), {
    participantIds: arrayRemove(userId)
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
    // Tambah baru
    const docRef = await addDoc(collection(db, SCHEDULES_COLLECTION), {
      userId,
      userName,
      date,
      location,
      updatedAt: Timestamp.fromDate(new Date()),
    });
    return { id: docRef.id, userId, userName, date, location };
  } else {
    // Update lokasi
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
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const getTodaySchedules = async (date) => {
  const q = query(
    collection(db, SCHEDULES_COLLECTION),
    where('date', '==', date)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

// --- KONFIRMASI KEHADIRAN (MANUAL UNTUK SIDEDI) ---
export const confirmSidediAttendance = async (userId, userName, date, fingerprintId = 0) => {
  // Cek apakah hari ini sudah ada log absen
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
