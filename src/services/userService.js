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
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const USERS_COLLECTION = 'users';

export const registerUser = async (userData) => {
  const existing = await getUserByFingerprintId(userData.fingerprintId);
  if (existing) {
    throw new Error(`Fingerprint ID ${userData.fingerprintId} sudah terdaftar atas nama ${existing.name}`);
  }

  const docRef = await addDoc(collection(db, USERS_COLLECTION), {
    ...userData,
    fingerprintId: Number(userData.fingerprintId),
    registeredAt: Timestamp.fromDate(new Date()),
    isActive: true,
  });

  return { id: docRef.id, ...userData };
};

export const getAllUsers = async () => {
  const q = query(
    collection(db, USERS_COLLECTION),
    orderBy('registeredAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    registeredAt: doc.data().registeredAt?.toDate?.() || null,
  }));
};

export const getUserByFingerprintId = async (fingerprintId) => {
  const q = query(
    collection(db, USERS_COLLECTION),
    where('fingerprintId', '==', Number(fingerprintId))
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data(),
  };
};

export const updateUser = async (userId, userData) => {
  if (userData.fingerprintId !== undefined) {
    const existing = await getUserByFingerprintId(userData.fingerprintId);
    if (existing && existing.id !== userId) {
      throw new Error(`Fingerprint ID ${userData.fingerprintId} sudah digunakan oleh ${existing.name}`);
    }
    userData.fingerprintId = Number(userData.fingerprintId);
  }

  await updateDoc(doc(db, USERS_COLLECTION, userId), userData);
  return { id: userId, ...userData };
};

export const deleteUser = async (userId) => {
  await deleteDoc(doc(db, USERS_COLLECTION, userId));
  return { id: userId };
};

export const deleteAllUsers = async () => {
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));
  const totalDocs = snapshot.docs.length;
  for (const userDoc of snapshot.docs) {
    await deleteDoc(doc(db, USERS_COLLECTION, userDoc.id));
  }
  return { deletedCount: totalDocs };
};

export const getActiveUsers = async () => {
  const q = query(
    collection(db, USERS_COLLECTION),
    where('isActive', '==', true)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const getPendingEnrollUsers = async () => {
  const q = query(
    collection(db, USERS_COLLECTION),
    where('status', '==', 'menunggu_enroll')
  );

  const snapshot = await getDocs(q);
  const users = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  // Urutkan berdasarkan waktu pendaftaran (paling lama duluan)
  return users.sort((a, b) => {
    const timeA = a.registeredAt?.toDate?.() || new Date(0);
    const timeB = b.registeredAt?.toDate?.() || new Date(0);
    return timeA - timeB;
  });
};

// Tambahkan di userService.js, setelah fungsi registerUser yang sudah ada

export const registerUserAndRequestEnroll = async (userData) => {
  // Simpan user baru TANPA fingerprintId dulu - menunggu hasil enroll fisik
  const docRef = await addDoc(collection(db, USERS_COLLECTION), {
    name: userData.name,
    // field lain sesuai kebutuhan (misal: kelas, jurusan, dll)
    ...userData,
    fingerprintId: null,
    status: 'menunggu_enroll',
    registeredAt: Timestamp.fromDate(new Date()),
    isActive: true,
  });

  return { id: docRef.id, ...userData };
};

// --- CRUD JURUSAN (MAJORS) ---
export const addMajor = async (name) => {
  const docRef = await addDoc(collection(db, 'majors'), { name });
  return { id: docRef.id, name };
};

export const getAllMajors = async () => {
  const snapshot = await getDocs(collection(db, 'majors'));
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })).sort((a, b) => a.name.localeCompare(b.name));
};

export const deleteMajor = async (majorId) => {
  await deleteDoc(doc(db, 'majors', majorId));
  return { id: majorId };
};

// --- CRUD PEMBIMBING (ADVISORS) ---
export const addAdvisor = async (name) => {
  const docRef = await addDoc(collection(db, 'advisors'), { name });
  return { id: docRef.id, name };
};

export const getAllAdvisors = async () => {
  const snapshot = await getDocs(collection(db, 'advisors'));
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })).sort((a, b) => a.name.localeCompare(b.name));
};

export const deleteAdvisor = async (advisorId) => {
  await deleteDoc(doc(db, 'advisors', advisorId));
  return { id: advisorId };
};