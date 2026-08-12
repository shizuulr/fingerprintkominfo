import { useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { processAttendanceScan } from '../services/attendanceService';
import { getUserByFingerprintId, getPendingEnrollUsers, updateUser } from '../services/userService';

// Buat antrian (queue) global untuk memproses scan secara sekuensial
// Ini mencegah race condition jika beberapa scan masuk bersamaan (terutama saat user menahan jari)
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
      // 1. Klaim scan ini menggunakan transaction untuk mencegah multi-client (admin dengan beberapa tab/perangkat)
      // memproses scan yang sama secara paralel yang dapat menyebabkan duplikasi data.
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
      // Jika sampai di sini, client ini berhasil mengklaim scan
    } catch (_err) {
      // Gagal klaim (sudah diklaim client lain atau sudah diproses), skip ke scan berikutnya
      continue;
    }

    try {
      // Firestore REST API mengirim angka dalam format string jika dibungkus 'integerValue'
      // atau langsung number. Kita pastikan formatnya Number.
      const fingerprintId = Number(scanData.fingerprintId);

      // Cari user berdasarkan fingerprint ID
      const user = await getUserByFingerprintId(fingerprintId);
      let userName;

      if (user) {
        userName = user.name;
      } else {
        // Auto-recovery: jika user tidak ditemukan (enroll_result tidak tersimpan),
        // cari user yang masih menunggu enroll dan assign fingerprintId ini
        const pendingUsers = await getPendingEnrollUsers();
        if (pendingUsers.length > 0) {
          const matchedUser = pendingUsers[0]; // user paling lama menunggu
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

      // Proses ke absensi (masuk/keluar otomatis)
      const result = await processAttendanceScan(fingerprintId, userName, user ? user.division : '');

      console.log(`Scan diproses: Fingerprint ID ${fingerprintId} - ${result.message}`);

      // Tandai scan ini sebagai sudah diproses agar tidak diloop ulang
      await updateDoc(scanRef, {
        status: 'processed'
      });

    } catch (error) {
      console.error('Gagal memproses scan otomatis:', error);
      // Anda bisa mengubah status menjadi 'error' jika diinginkan
      await updateDoc(scanRef, {
        status: 'error',
        errorMessage: error.message
      });
    }
  }

  isProcessing = false;
}

/**
 * Komponen ini berjalan di background (di-mount di App.jsx)
 * Fungsinya adalah mendengarkan data mentah dari ESP32 (koleksi raw_scans)
 * lalu memprosesnya menjadi absensi, dan mengubah statusnya menjadi 'processed'.
 */
export default function ScanProcessor() {
  useEffect(() => {
    // Dengarkan scan baru dari ESP32
    const q = query(
      collection(db, 'raw_scans'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          // Masukkan ke antrian dan jalankan prosesor
          scanQueue.push(change);
          processQueue();
        }
      });
    });

    return () => unsubscribe();
  }, []);

  return null; // Komponen ini tidak me-render apa-apa di UI
}
