import { useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { processAttendanceScan } from '../services/attendanceService';
import { getUserByFingerprintId, getPendingEnrollUsers, updateUser } from '../services/userService';

const scanQueue = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (scanQueue.length > 0) {
    const change = scanQueue.shift();
    const scanData = change.doc.data();
    const scanId = change.doc.id;
    const scanRef = doc(db, 'raw_scans', scanId);

    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(scanRef);
        if (!sfDoc.exists()) {
          throw new Error("Document does not exist!");
        }
        if (sfDoc.data().status !== 'pending') {
          throw new Error("Already claimed");
        }
        transaction.update(scanRef, { status: 'processing' });
      });
    } catch (_err) {
      continue;
    }

    try {
      const fingerprintId = Number(scanData.fingerprintId);

      // >>> BARU: Ambil waktu ASLI saat sidik jari discan (bukan waktu proses sekarang).
      // Field ini diisi ESP32 saat menulis ke raw_scans, baik lewat MQTT maupun HTTPS fallback.
      // Firestore Timestamp dari SDK punya method .toDate(); kalau field ini kosong/tidak ada
      // (misal data lama sebelum fitur ini ditambahkan), fallback ke null supaya
      // processAttendanceScan tetap jalan dengan waktu saat ini seperti perilaku lama.
      let scanTime = null;
      if (scanData.receivedAt && typeof scanData.receivedAt.toDate === 'function') {
        scanTime = scanData.receivedAt.toDate();
      }

      const user = await getUserByFingerprintId(fingerprintId);
      let userName;

      if (user) {
        userName = user.name;
      } else {
        const pendingUsers = await getPendingEnrollUsers();
        if (pendingUsers.length > 0) {
          const matchedUser = pendingUsers[0];
          await updateUser(matchedUser.id, {
            fingerprintId: fingerprintId,
            status: 'aktif',
          });
          userName = matchedUser.name;
          console.log(`Auto-recovery: fingerprintId ${fingerprintId} -> ${matchedUser.name} (${matchedUser.id})`);
        } else {
          userName = 'Unknown User';
        }
      }

      // >>> DIUBAH: scanTime diteruskan sebagai parameter ke-4
      const result = await processAttendanceScan(fingerprintId, userName, user ? user.division : '', scanTime);

      console.log(`Scan diproses: Fingerprint ID ${fingerprintId} - ${result.message}`);

      await updateDoc(scanRef, {
        status: 'processed'
      });

    } catch (error) {
      console.error('Gagal memproses scan otomatis:', error);
      await updateDoc(scanRef, {
        status: 'error',
        errorMessage: error.message
      });
    }
  }

  isProcessing = false;
}

export default function ScanProcessor() {
  useEffect(() => {
    const q = query(
      collection(db, 'raw_scans'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          scanQueue.push(change);
          processQueue();
        }
      });
    });

    return () => unsubscribe();
  }, []);

  return null;
}