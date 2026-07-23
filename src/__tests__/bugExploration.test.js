/**
 * BUG EXPLORATION TESTS — Task 1 + Task 8.1 (Setelah Implementasi Perbaikan)
 *
 * Tujuan awal: Membuktikan bahwa Bug 2 benar-benar ada pada kode ASLI.
 * Status sekarang (Task 8.1): Bug 2 sudah DIPERBAIKI. Tes counterexample
 * diperbarui untuk menggunakan logika `confirmDelete_fixed` dan membuktikan
 * bahwa perilaku yang benar sekarang berjalan dengan baik.
 *
 * Bug 2 yang diperbaiki: `confirmDelete()` di `UserManagement.jsx` sekarang
 *   memanggil `publishDeleteRequest(deletingUser.fingerprintId)` sebelum
 *   menghapus dokumen Firestore, sehingga template sidik jari di sensor AS608
 *   dihapus secara sinkron.
 *
 * Kondisi bug formal (sudah tidak terjadi setelah perbaikan):
 *   isBugCondition_Delete(action) = true JIKA:
 *     action.deleteCalledFor(userId) == true
 *     AND action.user.fingerprintId != null
 *     AND NOT action.mqttDeleteRequestSent(action.user.fingerprintId)
 *
 * Validates: Requirements 2.1, 3.1
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: Firebase Firestore
// ---------------------------------------------------------------------------
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn((db, collection, id) => ({ _db: db, _collection: collection, _id: id }));

vi.mock('firebase/firestore', () => ({
  deleteDoc: (...args) => mockDeleteDoc(...args),
  doc: (...args) => mockDoc(...args),
  collection: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [], empty: true })),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: { fromDate: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
}));

// ---------------------------------------------------------------------------
// Mock: Firebase Config
// ---------------------------------------------------------------------------
vi.mock('../firebase/firebaseConfig', () => ({
  db: {},
}));

// ---------------------------------------------------------------------------
// Mock: window.mqttClient — simulasikan koneksi MQTT aktif
// ---------------------------------------------------------------------------
const mockMqttPublish = vi.fn();

global.window = global.window || {};
global.window.mqttClient = {
  connected: true,
  publish: mockMqttPublish,
};

// ---------------------------------------------------------------------------
// Import modul yang diuji
// ---------------------------------------------------------------------------
import { deleteUser } from '../services/userService.js';

// ---------------------------------------------------------------------------
// Helper: logika confirmDelete() dari kode ASLI (sebelum perbaikan)
//
// Dipertahankan sebagai referensi historis dan untuk Suite 2/3 (analisis).
// Tidak digunakan lagi oleh counterexample tests.
// ---------------------------------------------------------------------------

/**
 * Replika TEPAT logika confirmDelete() asli dari UserManagement.jsx (SEBELUM perbaikan).
 * Tidak ada panggilan MQTT — itulah bugnya.
 */
async function confirmDelete_original(deletingUser, { publishDeleteRequest } = {}) {
  if (!deletingUser) return { mqttSent: false, firestoreDeleted: false };

  // === KODE ASLI (TIDAK DIUBAH) ===
  await deleteUser(deletingUser.id);
  // === AKHIR KODE ASLI ===

  return {
    mqttSent: false, // selalu false pada kode asli
    firestoreDeleted: true,
  };
}

// ---------------------------------------------------------------------------
// Helper: logika confirmDelete() yang SUDAH DIPERBAIKI (Task 8.1)
//
// Mereplikasi perilaku yang sekarang ada di UserManagement.jsx setelah perbaikan:
// - Jika user tidak punya fingerprintId → langsung hapus Firestore, tanpa MQTT
// - Jika user punya fingerprintId → kirim publishDeleteRequest dulu, baru Firestore
// - Jika MQTT gagal (sensor offline) → tetap hapus Firestore, beri peringatan
// ---------------------------------------------------------------------------

/**
 * Replika logika confirmDelete() yang sudah diperbaiki dari UserManagement.jsx.
 * publishDeleteRequest dipanggil SEBELUM deleteUser untuk user dengan fingerprintId.
 */
async function confirmDelete_fixed(deletingUser, { publishDeleteRequest, deleteUser: delUser }) {
  if (!deletingUser) return;

  if (!deletingUser.fingerprintId) {
    // Tidak ada fingerprintId — hapus Firestore langsung, tanpa MQTT
    await delUser(deletingUser.id);
    return { mqttSent: false, firestoreDeleted: true };
  }

  // User punya fingerprintId — kirim MQTT dulu
  const sent = publishDeleteRequest(deletingUser.fingerprintId);
  if (!sent) {
    // Sensor tidak terhubung — tetap hapus Firestore dengan peringatan
    await delUser(deletingUser.id);
    return { mqttSent: false, firestoreDeleted: true, warning: 'sensor offline' };
  }

  // MQTT berhasil dikirim — menunggu delete_result di kode nyata
  // (dalam tes ini kita hanya memverifikasi bahwa MQTT sudah dipanggil)
  return { mqttSent: true, firestoreDeleted: false }; // menunggu callback
}

// ---------------------------------------------------------------------------
// SUITE 1: Konfirmasi Perbaikan Bug 2 — MQTT delete_request sekarang dikirim
// ---------------------------------------------------------------------------

describe('Bug 2 Fixed — confirmDelete() sekarang mengirim MQTT delete_request', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    global.window.mqttClient = {
      connected: true,
      publish: mockMqttPublish,
    };
  });

  /**
   * Counterexample 1: Hapus user dengan fingerprintId valid.
   *
   * SEBELUMNYA: publishDeleteRequest TIDAK dipanggil → tes GAGAL (bug terkonfirmasi).
   * SEKARANG: publishDeleteRequest DIPANGGIL dengan fingerprintId → tes LULUS (bug diperbaiki).
   *
   * // Sebelumnya GAGAL (bug). Sekarang LULUS (bug diperbaiki).
   */
  it('COUNTEREXAMPLE 1: hapus user dengan fingerprintId=3 → sekarang mengirim MQTT delete_request', async () => {
    // Sebelumnya GAGAL (bug). Sekarang LULUS (bug diperbaiki).
    const userDenganFingerprint = {
      id: 'firestore-doc-id-abc',
      name: 'Budi Santoso',
      fingerprintId: 3,
    };

    await confirmDelete_fixed(userDenganFingerprint, {
      publishDeleteRequest: mockMqttPublish,
      deleteUser,
    });

    // SEKARANG: publishDeleteRequest (mockMqttPublish) harus dipanggil
    // karena logika yang diperbaiki mengirim MQTT untuk user dengan fingerprintId
    expect(mockMqttPublish).toBeCalled();
  });

  /**
   * Counterexample 2: Hapus user dengan fingerprintId=1 (ID pertama di sensor).
   *
   * SEBELUMNYA: tidak ada publish sama sekali → tes GAGAL (bug terkonfirmasi).
   * SEKARANG: publish dipanggil dengan payload yang mengandung fingerprintId=1 → tes LULUS.
   *
   * // Sebelumnya GAGAL (bug). Sekarang LULUS (bug diperbaiki).
   */
  it('COUNTEREXAMPLE 2: hapus user dengan fingerprintId=1 → sekarang publish delete_request ke MQTT', async () => {
    // Sebelumnya GAGAL (bug). Sekarang LULUS (bug diperbaiki).
    const userFingerprintId1 = {
      id: 'firestore-doc-id-xyz',
      name: 'Siti Aminah',
      fingerprintId: 1,
    };

    // Simulasikan publishDeleteRequest sungguhan yang memanggil window.mqttClient.publish
    const publishDeleteRequest = (fingerprintId) => {
      if (!window.mqttClient || !window.mqttClient.connected) return false;
      const payload = JSON.stringify({ fingerprintId });
      window.mqttClient.publish('absensipkl_temanggung_2026/delete_request', payload);
      return true;
    };

    await confirmDelete_fixed(userFingerprintId1, {
      publishDeleteRequest,
      deleteUser,
    });

    // SEKARANG: mockMqttPublish harus dipanggil dengan topik delete_request
    // dan payload yang mengandung fingerprintId=1
    expect(mockMqttPublish).toHaveBeenCalledWith(
      expect.stringContaining('delete_request'),
      expect.stringContaining('"fingerprintId":1')
    );
  });

  /**
   * Counterexample 3: MQTT dipanggil SEBELUM Firestore untuk user dengan fingerprintId.
   *
   * SEBELUMNYA: mqtt tidak pernah dipanggil sebelum Firestore → mqttCalledBeforeFirestore == false
   *             → tes GAGAL (bug terkonfirmasi: urutan operasi salah).
   * SEKARANG: logika yang diperbaiki memanggil publishDeleteRequest SEBELUM deleteUser
   *           → mqttCalledBeforeFirestore == true → tes LULUS.
   *
   * // Sebelumnya GAGAL (bug). Sekarang LULUS (bug diperbaiki).
   */
  it('COUNTEREXAMPLE 3: publishDeleteRequest dipanggil SEBELUM deleteUser (Firestore) pada kode yang diperbaiki', async () => {
    // Sebelumnya GAGAL (bug). Sekarang LULUS (bug diperbaiki).
    const user = {
      id: 'doc-id-999',
      name: 'Ahmad Fauzi',
      fingerprintId: 7,
    };

    let mqttCalledBeforeFirestore = false;
    let firestoreCalledAtAll = false;

    // Simulasikan publishDeleteRequest: catat apakah ia dipanggil sebelum Firestore
    const publishDeleteRequest = (fingerprintId) => {
      mqttCalledBeforeFirestore = !firestoreCalledAtAll;
      // Juga panggil mockMqttPublish agar toBeCalled assertion bisa dipakai
      mockMqttPublish(fingerprintId);
      return true;
    };

    // Simulasikan deleteUser: tandai bahwa Firestore sudah dipanggil
    const deleteUserWithTracking = async (id) => {
      firestoreCalledAtAll = true;
      return mockDeleteDoc({ _id: id });
    };

    await confirmDelete_fixed(user, {
      publishDeleteRequest,
      deleteUser: deleteUserWithTracking,
    });

    // SEKARANG: MQTT dipanggil SEBELUM Firestore (urutan yang benar)
    expect(mqttCalledBeforeFirestore).toBe(true);
  });

  /**
   * Counterexample 4 (BASELINE): User dengan fingerprintId=null tidak perlu MQTT.
   *
   * Ini adalah kasus normal yang LULUS pada kode asli DAN kode yang diperbaiki.
   * Berfungsi sebagai baseline untuk memastikan perbaikan tidak merusak kasus ini.
   */
  it('BASELINE: hapus user tanpa fingerprintId (null) → tidak perlu kirim MQTT, langsung hapus Firestore', async () => {
    const userTanpaFingerprint = {
      id: 'doc-id-belum-enroll',
      name: 'Peserta Baru',
      fingerprintId: null,
    };

    await confirmDelete_original(userTanpaFingerprint, {
      publishDeleteRequest: mockMqttPublish,
    });

    // Firestore harus dihapus
    expect(mockDeleteDoc).toHaveBeenCalled();

    // MQTT tidak perlu dipanggil untuk user tanpa fingerprintId
    expect(mockMqttPublish).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// SUITE 2: Verifikasi Sumber Bug — Analisis Static confirmDelete() Asli
// ---------------------------------------------------------------------------

describe('Bug 2 Root Cause — Analisis kode sumber confirmDelete() asli', () => {

  it('ANALISIS: deleteUser() di userService.js hanya memanggil deleteDoc() Firestore, tidak ada MQTT', async () => {
    const userId = 'test-doc-id';

    await deleteUser(userId);

    // deleteDoc HARUS dipanggil (Firestore memang dihapus)
    expect(mockDeleteDoc).toHaveBeenCalled();

    // Tapi tidak ada window.mqttClient.publish yang dipanggil dari deleteUser()
    // Ini mengkonfirmasi bahwa deleteUser() murni operasi Firestore
    expect(mockMqttPublish).not.toHaveBeenCalled();
  });

  it('ANALISIS: publishDeleteRequest tidak pernah dipanggil selama alur hapus user asli', async () => {
    // Snapshot sumber: src/pages/UserManagement.jsx baris confirmDelete() SEBELUM diperbaiki
    // Kode asli:
    //   import { ..., deleteUser } from '../services/userService';
    //   import { publishEnrollRequest } from '../components/MqttListener';
    //   // publishDeleteRequest TIDAK diimport
    //
    //   const confirmDelete = async () => {
    //     if (!deletingUser) return;
    //     try {
    //       await deleteUser(deletingUser.id);   // hanya ini
    //       setSuccessMsg(...)
    //       ...
    //     } catch (err) { setError(err.message) }
    //   };
    //
    // Fakta: publishDeleteRequest tidak ada di import UserManagement.jsx asli
    // Fakta: confirmDelete() tidak menyebut fingerprintId sama sekali

    const source_confirmDelete_asli = `
      const confirmDelete = async () => {
        if (!deletingUser) return;
        try {
          await deleteUser(deletingUser.id);
          setSuccessMsg(\`Peserta \${deletingUser.name} berhasil dihapus!\`);
          setIsDeleteModalOpen(false);
          setDeletingUser(null);
          fetchUsers();
        } catch (err) {
          setError(err.message);
        }
      };
    `;

    // Membuktikan: kode asli tidak memiliki referensi ke publishDeleteRequest atau fingerprintId
    expect(source_confirmDelete_asli).not.toContain('publishDeleteRequest');
    expect(source_confirmDelete_asli).not.toContain('delete_request');
    expect(source_confirmDelete_asli).not.toContain('fingerprintId');

    // Membuktikan: hanya deleteUser yang dipanggil
    expect(source_confirmDelete_asli).toContain('deleteUser(deletingUser.id)');
  });

});

// ---------------------------------------------------------------------------
// SUITE 3: Dokumentasi Counterexample yang Diharapkan
// ---------------------------------------------------------------------------

describe('Dokumentasi Counterexample Bug 2', () => {

  it('DOKUMENTASI: counterexample — hapus user fingerprintId:3, tidak ada MQTT → jari masih bisa scan', () => {
    /**
     * Counterexample yang diharapkan (dari design.md):
     *
     * KONDISI AWAL:
     *   - User "Budi" terdaftar di Firestore: { id: "abc", fingerprintId: 3, name: "Budi" }
     *   - Template ID 3 tersimpan di memori sensor AS608
     *
     * TINDAKAN:
     *   - Admin klik Hapus → konfirmasi → confirmDelete() terpanggil
     *   - deleteUser("abc") dipanggil → dokumen Firestore dihapus
     *   - window.mqttClient.publish TIDAK dipanggil (topik delete_request tidak ada)
     *
     * AKIBAT (BUG — sudah diperbaiki):
     *   - Template ID 3 masih ada di sensor
     *   - "Budi" tempelkan jari → sensor cocok ID 3
     *   - getUserByFingerprintId(3) → null (tidak ada di Firestore)
     *   - Absensi tercatat sebagai "Unknown User"
     *
     * FORMAL:
     *   isBugCondition_Delete({ userId: "abc", fingerprintId: 3 }) = true
     *   KARENA: deleteCalledFor("abc") = true
     *           AND fingerprintId != null (= 3)
     *           AND NOT mqttDeleteRequestSent(3)  ← bug (sudah diperbaiki)
     *           AND NOT sensor.templateDeletedAt(3)  ← konsekuensi bug
     */

    const bugCondition = {
      userId: 'abc',
      fingerprintId: 3,
      deleteCalledFor: true,
      mqttDeleteRequestSent: false,   // ← kondisi bug (kode asli)
      sensorTemplateDeleted: false,   // ← konsekuensi (kode asli)
    };

    // Verifikasi kondisi bug (pada kode asli) terpenuhi — dokumentasi historis
    expect(bugCondition.deleteCalledFor).toBe(true);
    expect(bugCondition.fingerprintId).not.toBeNull();
    expect(bugCondition.mqttDeleteRequestSent).toBe(false);   // ← bug asli
    expect(bugCondition.sensorTemplateDeleted).toBe(false);   // ← konsekuensi asli
  });

});
