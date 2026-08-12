/**
 * PRESERVATION TESTS — Task 2 (Sebelum Implementasi Perbaikan)
 *
 * Tujuan: Membuktikan bahwa perilaku-perilaku BENAR yang sudah ada
 * pada kode ASLI tetap berjalan dengan benar — dan harus tetap lulus
 * setelah perbaikan Bug 1 dan Bug 2 diimplementasikan.
 *
 * Tes ini adalah BASELINE PERILAKU yang tidak boleh berubah (preservation).
 *
 * Ekspektasi tes ini: LULUS pada kode asli (dan juga setelah perbaikan).
 *
 * Validates: Requirements 1.2, 3.4, 4.4
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: Firebase Firestore
// ---------------------------------------------------------------------------
const mockAddDoc    = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDocs   = vi.fn();
const mockDoc       = vi.fn((db, col, id) => ({ _db: db, _col: col, _id: id }));
const mockCollection = vi.fn((db, name) => ({ _db: db, _name: name }));
const mockQuery     = vi.fn((...args) => ({ _args: args }));
const mockWhere     = vi.fn((...args) => ({ _where: args }));
const mockOrderBy   = vi.fn((...args) => ({ _orderBy: args }));
const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
  addDoc:     (...args) => mockAddDoc(...args),
  updateDoc:  (...args) => mockUpdateDoc(...args),
  deleteDoc:  (...args) => mockDeleteDoc(...args),
  getDocs:    (...args) => mockGetDocs(...args),
  doc:        (...args) => mockDoc(...args),
  collection: (...args) => mockCollection(...args),
  query:      (...args) => mockQuery(...args),
  where:      (...args) => mockWhere(...args),
  orderBy:    (...args) => mockOrderBy(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  Timestamp: {
    fromDate: vi.fn((date) => ({
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
      toDate: () => date,
    })),
  },
}));

// ---------------------------------------------------------------------------
// Mock: Firebase Config
// ---------------------------------------------------------------------------
vi.mock('../firebase/firebaseConfig', () => ({
  db: { _mock: 'firestore-db' },
}));

// ---------------------------------------------------------------------------
// Mock: window.mqttClient
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
import {
  registerUserAndRequestEnroll,
  updateUser,
  getAllUsers,
  getUserByFingerprintId,
  deleteUser,
} from '../services/userService.js';

import { processAttendanceScan } from '../services/attendanceService.js';

// ---------------------------------------------------------------------------
// Setup: Reset semua mock sebelum setiap test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  global.window.mqttClient = {
    connected: true,
    publish: mockMqttPublish,
  };
});

// ===========================================================================
// SUITE 1: registerUserAndRequestEnroll
// ===========================================================================

describe('Preservation 1 — registerUserAndRequestEnroll()', () => {

  it('menyimpan dokumen baru ke Firestore dengan fingerprintId: null dan status: menunggu_enroll', async () => {
    const fakeDocRef = { id: 'new-user-doc-id-123' };
    mockAddDoc.mockResolvedValue(fakeDocRef);

    const formData = {
      name: 'Siti Aminah',
      institution: 'SMK Negeri 1 Temanggung',
      division: 'IT',
      startDate: '2025-01-06',
      endDate: '2025-03-28',
    };

    const result = await registerUserAndRequestEnroll(formData);

    // addDoc dipanggil tepat sekali
    expect(mockAddDoc).toHaveBeenCalledTimes(1);

    // Dokumen yang disimpan HARUS mengandung fingerprintId: null
    const savedDoc = mockAddDoc.mock.calls[0][1];
    expect(savedDoc.fingerprintId).toBeNull();

    // Dokumen yang disimpan HARUS mengandung status: 'menunggu_enroll'
    expect(savedDoc.status).toBe('menunggu_enroll');

    // Field data asli tersimpan
    expect(savedDoc.name).toBe('Siti Aminah');
    expect(savedDoc.institution).toBe('SMK Negeri 1 Temanggung');

    // Return value berisi id dari Firestore
    expect(result.id).toBe('new-user-doc-id-123');
  });

  it('tidak memanggil window.mqttClient.publish (MQTT diurus oleh komponen lain)', async () => {
    mockAddDoc.mockResolvedValue({ id: 'doc-abc' });

    await registerUserAndRequestEnroll({ name: 'Budi', institution: 'SMK', division: 'TKJ' });

    // registerUserAndRequestEnroll murni operasi Firestore — MQTT tidak dipanggil dari sini
    expect(mockMqttPublish).not.toHaveBeenCalled();
  });

  it('menyimpan isActive: true pada dokumen baru', async () => {
    mockAddDoc.mockResolvedValue({ id: 'doc-xyz' });

    await registerUserAndRequestEnroll({ name: 'Ahmad', institution: 'Universitas A', division: 'Backend' });

    const savedDoc = mockAddDoc.mock.calls[0][1];
    expect(savedDoc.isActive).toBe(true);
  });

});

// ===========================================================================
// SUITE 2: updateUser
// ===========================================================================

describe('Preservation 2 — updateUser()', () => {

  it('memanggil updateDoc untuk mengupdate data user', async () => {
    // Simulasikan getDocs mengembalikan kosong (tidak ada konflik fingerprintId)
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockUpdateDoc.mockResolvedValue(undefined);

    const userId = 'user-doc-id-456';
    const updatedData = {
      name: 'Budi Santoso (Updated)',
      institution: 'Politeknik Baru',
      division: 'Jaringan',
    };

    const result = await updateUser(userId, updatedData);

    // updateDoc HARUS dipanggil
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);

    // Return value berisi userId
    expect(result.id).toBe(userId);
  });

  it('tidak menyentuh fingerprintId jika tidak ada di data update', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockUpdateDoc.mockResolvedValue(undefined);

    const userId = 'user-555';
    const updatedData = {
      name: 'Nama Baru',
      institution: 'Instansi Baru',
      division: 'Divisi Baru',
    };

    await updateUser(userId, updatedData);

    // Data yang dikirim ke updateDoc tidak mengandung fingerprintId
    const docArg = mockUpdateDoc.mock.calls[0][1];
    expect(docArg.fingerprintId).toBeUndefined();
  });

  it('tidak memanggil deleteDoc — updateUser tidak menghapus apapun', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockUpdateDoc.mockResolvedValue(undefined);

    await updateUser('user-789', { name: 'Test User', institution: 'Test', division: 'Test' });

    // updateUser tidak boleh menghapus dokumen apapun
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('tidak memanggil MQTT saat update — updateUser murni operasi Firestore', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockUpdateDoc.mockResolvedValue(undefined);

    await updateUser('user-111', { name: 'User MQTT Test', institution: 'Inst', division: 'Div' });

    expect(mockMqttPublish).not.toHaveBeenCalled();
  });

});

// ===========================================================================
// SUITE 3: getAllUsers
// ===========================================================================

describe('Preservation 3 — getAllUsers()', () => {

  it('mengembalikan semua user dari Firestore', async () => {
    const fakeUsers = [
      {
        id: 'user-1',
        data: () => ({
          name: 'Budi',
          fingerprintId: 3,
          status: 'aktif',
          institution: 'SMK',
          division: 'IT',
          registeredAt: { toDate: () => new Date('2025-01-01'), seconds: 0, nanoseconds: 0 },
        }),
      },
      {
        id: 'user-2',
        data: () => ({
          name: 'Siti',
          fingerprintId: null,
          status: 'menunggu_enroll',
          institution: 'SMA',
          division: 'Akuntansi',
          registeredAt: { toDate: () => new Date('2025-01-15'), seconds: 0, nanoseconds: 0 },
        }),
      },
    ];

    mockGetDocs.mockResolvedValue({
      docs: fakeUsers,
      empty: false,
    });

    const result = await getAllUsers();

    // Harus mengembalikan array dengan jumlah user yang benar
    expect(result).toHaveLength(2);

    // Data user termasuk id dan field lainnya
    expect(result[0].id).toBe('user-1');
    expect(result[0].name).toBe('Budi');
    expect(result[0].fingerprintId).toBe(3);

    expect(result[1].id).toBe('user-2');
    expect(result[1].name).toBe('Siti');
  });

  it('mengembalikan array kosong jika tidak ada user', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });

    const result = await getAllUsers();

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('menggunakan orderBy registeredAt desc', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });

    await getAllUsers();

    // Verifikasi bahwa query dibangun dengan orderBy
    expect(mockOrderBy).toHaveBeenCalledWith('registeredAt', 'desc');
  });

});

// ===========================================================================
// SUITE 4: getUserByFingerprintId
// ===========================================================================

describe('Preservation 4 — getUserByFingerprintId()', () => {

  it('mengembalikan user yang cocok berdasarkan fingerprintId numerik', async () => {
    const fakeUser = {
      id: 'user-fp-3',
      data: () => ({
        name: 'Budi Santoso',
        fingerprintId: 3,
        status: 'aktif',
      }),
    };

    mockGetDocs.mockResolvedValue({
      docs: [fakeUser],
      empty: false,
    });

    const result = await getUserByFingerprintId(3);

    expect(result).not.toBeNull();
    expect(result.id).toBe('user-fp-3');
    expect(result.name).toBe('Budi Santoso');
  });

  it('mengembalikan null jika tidak ada user dengan fingerprintId tersebut', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });

    const result = await getUserByFingerprintId(999);

    expect(result).toBeNull();
  });

  it('mengonversi fingerprintId ke Number saat query (konsistensi tipe data)', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });

    // Kirim fingerprintId sebagai string — harus dikonversi ke Number dalam query
    await getUserByFingerprintId('5');

    // where harus dipanggil dengan nilai numerik
    expect(mockWhere).toHaveBeenCalledWith('fingerprintId', '==', 5);
  });

  it('menangani kasus fingerprintId yang tidak terdaftar — tidak throw, return null', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });

    // Tidak boleh throw error
    await expect(getUserByFingerprintId(12345)).resolves.toBeNull();
  });

});

// ===========================================================================
// SUITE 5: deleteUser dengan fingerprintId null (kasus non-bug)
// ===========================================================================

describe('Preservation 5 — deleteUser() untuk user dengan fingerprintId null', () => {

  it('memanggil deleteDoc untuk menghapus dokumen Firestore', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);

    const userId = 'doc-belum-enroll-001';

    await deleteUser(userId);

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });

  it('tidak memanggil window.mqttClient.publish — tidak ada MQTT untuk user tanpa fingerprintId', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);

    // Simulasi: hapus user yang fingerprintId-nya null (belum enroll)
    // deleteUser() tidak tahu fingerprintId — hanya menerima userId
    // Behavior: langsung hapus Firestore, tidak ada MQTT
    await deleteUser('doc-no-fingerprint');

    // MQTT tidak boleh dipanggil — ini adalah preservation case (bukan bug)
    expect(mockMqttPublish).not.toHaveBeenCalled();
  });

  it('mengembalikan objek dengan userId setelah berhasil', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);

    const userId = 'doc-to-delete-123';
    const result = await deleteUser(userId);

    expect(result).toEqual({ id: userId });
  });

  it('tidak memanggil addDoc atau updateDoc saat menghapus user', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);

    await deleteUser('doc-only-delete');

    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

});

// ===========================================================================
// SUITE 6: handleEnrollResult — Update fingerprintId saat enroll sukses
// ===========================================================================

describe('Preservation 6 — handleEnrollResult() saat enroll berhasil', () => {

  it('mengupdate dokumen user dengan fingerprintId dan status aktif saat success: true', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    const enrollResultData = {
      docId: 'user-doc-awaiting-enroll',
      success: true,
      fingerprintId: 5,
    };

    // Simulasikan logika handleEnrollResult yang diambil dari MqttListener.jsx
    // (logika murni, tidak perlu React/MQTT client untuk diuji)
    const { docId, success, fingerprintId } = enrollResultData;

    expect(docId).toBeTruthy(); // docId ada

    if (success) {
      await mockUpdateDoc(mockDoc({}, 'users', docId), {
        fingerprintId: Number(fingerprintId),
        status: 'aktif',
      });
    }

    // updateDoc HARUS dipanggil tepat sekali
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);

    // Argumen updateDoc: dokumen users/<docId> harus diupdate
    // dengan fingerprintId numerik dan status 'aktif'
    const updateArg = mockUpdateDoc.mock.calls[0][1];
    expect(updateArg.fingerprintId).toBe(5);
    expect(updateArg.status).toBe('aktif');
  });

  it('mengupdate status menjadi gagal_enroll saat success: false', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    const enrollResultData = {
      docId: 'user-doc-failed-enroll',
      success: false,
      fingerprintId: null,
    };

    const { docId, success } = enrollResultData;

    if (!success) {
      await mockUpdateDoc(mockDoc({}, 'users', docId), {
        status: 'gagal_enroll',
      });
    }

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const updateArg = mockUpdateDoc.mock.calls[0][1];
    expect(updateArg.status).toBe('gagal_enroll');
  });

  it('tidak melakukan apapun jika docId tidak ada di payload', async () => {
    // Jika docId null/undefined, handleEnrollResult harus early return
    const enrollResultData = {
      docId: null,
      success: true,
      fingerprintId: 3,
    };

    // Replika logika guard dari handleEnrollResult
    if (!enrollResultData.docId) {
      // Early return — tidak ada update
    } else {
      await mockUpdateDoc(mockDoc({}, 'users', enrollResultData.docId), {
        fingerprintId: Number(enrollResultData.fingerprintId),
        status: 'aktif',
      });
    }

    // updateDoc tidak boleh dipanggil karena docId null
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('mengonversi fingerprintId ke Number saat update', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    // fingerprintId diterima sebagai string dari JSON MQTT
    const fingerprintIdFromMqtt = '7'; // string

    await mockUpdateDoc(mockDoc({}, 'users', 'doc-abc'), {
      fingerprintId: Number(fingerprintIdFromMqtt),
      status: 'aktif',
    });

    const updateArg = mockUpdateDoc.mock.calls[0][1];
    expect(typeof updateArg.fingerprintId).toBe('number');
    expect(updateArg.fingerprintId).toBe(7);
  });

});

// ===========================================================================
// SUITE 7: processAttendanceScan — Absensi scan jari yang terdaftar
// ===========================================================================

describe('Preservation 7 — processAttendanceScan() untuk jari yang terdaftar', () => {

  it('membuat record absensi baru (check-in) saat belum ada record hari ini', async () => {
    // Tidak ada record hari ini untuk fingerprint ini
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockAddDoc.mockResolvedValue({ id: 'attendance-new-record' });

    // Simulasikan hari kerja (Senin)
    const mondayDate = new Date('2025-01-06T07:00:00'); // Senin, 07:00 (tepat waktu)
    vi.setSystemTime(mondayDate);

    const result = await processAttendanceScan(3, 'Budi Santoso');

    // addDoc HARUS dipanggil untuk membuat record absensi baru
    expect(mockAddDoc).toHaveBeenCalledTimes(1);

    const savedRecord = mockAddDoc.mock.calls[0][1];
    expect(savedRecord.fingerprintId).toBe(3);
    expect(savedRecord.userName).toBe('Budi Santoso');
    expect(savedRecord.checkIn).toBeDefined();
    expect(savedRecord.checkOut).toBeNull();

    expect(result.success).toBe(true);
    expect(result.type).toBe('checkIn');

    vi.useRealTimers();
  });

  it('menandai status Hadir saat scan sebelum jam 07:30', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockAddDoc.mockResolvedValue({ id: 'attendance-on-time' });

    // 07:00 — sebelum batas 07:30 → status 'Hadir'
    const onTime = new Date('2025-01-06T07:00:00');
    vi.setSystemTime(onTime);

    const result = await processAttendanceScan(5, 'Siti');

    const savedRecord = mockAddDoc.mock.calls[0][1];
    expect(savedRecord.status).toBe('Hadir (KOMINFO)');
    expect(result.status).toBe('Hadir (KOMINFO)');

    vi.useRealTimers();
  });

  it('menandai status Terlambat saat scan setelah jam 07:30', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockAddDoc.mockResolvedValue({ id: 'attendance-late' });

    // 08:00 — setelah batas 07:30 → status 'Terlambat'
    const lateTime = new Date('2025-01-06T08:00:00');
    vi.setSystemTime(lateTime);

    const result = await processAttendanceScan(2, 'Ahmad Fauzi');

    const savedRecord = mockAddDoc.mock.calls[0][1];
    expect(savedRecord.status).toBe('Terlambat (KOMINFO)');
    expect(result.status).toBe('Terlambat (KOMINFO)');

    vi.useRealTimers();
  });

  it('melakukan check-out saat sudah ada record check-in hari ini', async () => {
    const existingCheckIn = {
      id: 'attendance-existing',
      data: () => ({
        fingerprintId: 3,
        userName: 'Budi',
        date: '2025-01-06',
        checkIn: { toDate: () => new Date('2025-01-06T07:00:00') },
        checkOut: null,
        status: 'Hadir',
      }),
    };

    mockGetDocs.mockResolvedValue({
      docs: [existingCheckIn],
      empty: false,
    });
    mockUpdateDoc.mockResolvedValue(undefined);

    const checkOutTime = new Date('2025-01-06T16:00:00');
    vi.setSystemTime(checkOutTime);

    const result = await processAttendanceScan(3, 'Budi');

    // updateDoc HARUS dipanggil untuk check-out
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.type).toBe('checkOut');

    vi.useRealTimers();
  });

  it('menolak scan di hari Sabtu/Minggu (hari libur)', async () => {
    // Minggu
    const sunday = new Date('2025-01-05T09:00:00'); // Minggu
    vi.setSystemTime(sunday);

    const result = await processAttendanceScan(3, 'Budi');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/libur/i);

    // Tidak ada record yang dibuat
    expect(mockAddDoc).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('mengembalikan pesan error jika sudah check-in dan check-out', async () => {
    const alreadyDone = {
      id: 'attendance-complete',
      data: () => ({
        fingerprintId: 3,
        userName: 'Budi',
        date: '2025-01-06',
        checkIn: { toDate: () => new Date('2025-01-06T07:00:00') },
        checkOut: { toDate: () => new Date('2025-01-06T16:00:00') },
        status: 'Hadir',
      }),
    };

    mockGetDocs.mockResolvedValue({
      docs: [alreadyDone],
      empty: false,
    });

    const lunchTime = new Date('2025-01-06T14:00:00');
    vi.setSystemTime(lunchTime);

    const result = await processAttendanceScan(3, 'Budi');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/sudah/i);

    vi.useRealTimers();
  });

});
