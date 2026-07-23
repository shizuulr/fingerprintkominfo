import { useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { processAttendanceScan } from '../services/attendanceService';
import { getUserByFingerprintId, getPendingEnrollUsers, updateUser } from '../services/userService';

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
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const scanData = change.doc.data();
          const scanId = change.doc.id;
          
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
            await updateDoc(doc(db, 'raw_scans', scanId), {
              status: 'processed'
            });

          } catch (error) {
            console.error('Gagal memproses scan otomatis:', error);
            // Anda bisa mengubah status menjadi 'error' jika diinginkan
            await updateDoc(doc(db, 'raw_scans', scanId), {
              status: 'error',
              errorMessage: error.message
            });
          }
        }
      });
    });

    return () => unsubscribe();
  }, []);

  return null; // Komponen ini tidak me-render apa-apa di UI
}
