import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  deleteDoc,
  doc,
  writeBatch,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const HOLIDAYS_COLLECTION = 'kalender_libur';
const SPECIAL_SCHEDULES_COLLECTION = 'jadwal_khusus';

/**
 * Fetch holidays from API and cache them in Firestore.
 * Uses dayoffapi.vercel.app as the primary source.
 */
export const syncHolidays = async (year) => {
  const currentYear = year || new Date().getFullYear();
  let holidays = [];

  // Fetch from API (menggunakan sumber data dari pytanggalmerah / APIHariLibur_V2)
  try {
    const res = await fetch(`https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/holidays.json`);
    if (!res.ok) throw new Error('Holiday API failed');
    const data = await res.json();

    for (const [date, info] of Object.entries(data)) {
      if (date.startsWith(String(currentYear))) {
        const nama = info.summary || 'Libur Nasional';
        const isCuti = /cuti/i.test(nama);
        holidays.push({
          tanggal: date,
          keterangan: nama,
          jenis: isCuti ? 'cuti_bersama' : 'libur_nasional',
          sumber: 'api',
        });
      }
    }
  } catch (error) {
    console.error('Holiday API failed:', error);
    throw new Error('Gagal menyinkronkan data hari libur dari API.');
  }

  if (holidays.length === 0) return 0;

  // 3. Clear existing API holidays for this year in Firestore to prevent duplicates
  const q = query(
    collection(db, HOLIDAYS_COLLECTION),
    where('sumber', '==', 'api')
  );
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  
  let deletedCount = 0;
  snapshot.docs.forEach(docSnap => {
    const dateStr = docSnap.data().tanggal;
    if (dateStr && dateStr.startsWith(String(currentYear))) {
      batch.delete(docSnap.ref);
      deletedCount++;
    }
  });
  if (deletedCount > 0) {
    await batch.commit();
  }

  // 4. Save new holidays with specific IDs to prevent race-condition duplicates
  const saveBatch = writeBatch(db);
  holidays.forEach(h => {
    // Buat ID unik berdasarkan tanggal dan nama libur
    const safeName = h.keterangan.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const docId = `api_${h.tanggal}_${safeName}`;
    const docRef = doc(db, HOLIDAYS_COLLECTION, docId);
    saveBatch.set(docRef, h, { merge: true });
  });
  await saveBatch.commit();

  return holidays.length;
};

/**
 * Get all cached holidays
 */
export const getCachedHolidays = async () => {
  const snapshot = await getDocs(collection(db, HOLIDAYS_COLLECTION));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

/**
 * Add a manual/custom holiday to Firestore
 */
export const addManualHoliday = async (tanggal, keterangan, jenis = 'libur_nasional') => {
  const docRef = await addDoc(collection(db, HOLIDAYS_COLLECTION), {
    tanggal,
    keterangan,
    jenis,
    sumber: 'manual'
  });
  return { id: docRef.id, tanggal, keterangan, jenis, sumber: 'manual' };
};

/**
 * Delete a holiday from Firestore
 */
export const deleteHoliday = async (id) => {
  await deleteDoc(doc(db, HOLIDAYS_COLLECTION, id));
};

/**
 * Add a Special Schedule (Jadwal Khusus / Hari Penting)
 */
export const addSpecialSchedule = async (tanggal, keterangan) => {
  // Check if exists
  const q = query(collection(db, SPECIAL_SCHEDULES_COLLECTION), where('tanggal', '==', tanggal));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    // Update existing
    const existingDoc = snapshot.docs[0];
    await updateDoc(doc(db, SPECIAL_SCHEDULES_COLLECTION, existingDoc.id), { keterangan });
    return { id: existingDoc.id, tanggal, keterangan };
  }
  const docRef = await addDoc(collection(db, SPECIAL_SCHEDULES_COLLECTION), {
    tanggal,
    keterangan
  });
  return { id: docRef.id, tanggal, keterangan };
};

/**
 * Get all Special Schedules
 */
export const getSpecialSchedules = async () => {
  const snapshot = await getDocs(collection(db, SPECIAL_SCHEDULES_COLLECTION));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

/**
 * Delete a Special Schedule
 */
export const deleteSpecialSchedule = async (id) => {
  await deleteDoc(doc(db, SPECIAL_SCHEDULES_COLLECTION, id));
};

/**
 * Central helper getDayType(tanggal)
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<'weekend' | 'libur_nasional' | 'normal'>}
 */
export const getDayType = async (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  
  // 1. Check Weekend (Saturday=6, Sunday=0)
  if (day === 0 || day === 6) {
    return 'weekend';
  }

  // 2. Check Cached Holidays (Libur Nasional / Cuti Bersama)
  const holidayQuery = query(collection(db, HOLIDAYS_COLLECTION), where('tanggal', '==', dateStr));
  const holidaySnapshot = await getDocs(holidayQuery);
  if (!holidaySnapshot.empty) {
    return 'libur_nasional';
  }

  return 'normal';
};
