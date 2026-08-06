# SIAP — Sistem Informasi Absensi PKL

**Dokumentasi Teknis untuk Developer**
Dinas Komunikasi dan Informatika, Kabupaten Temanggung · 2026

---

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Arsitektur Sistem](#2-arsitektur-sistem)
3. [Tech Stack](#3-tech-stack)
4. [Struktur Proyek](#4-struktur-proyek)
5. [Setup & Instalasi](#5-setup--instalasi)
6. [Variabel Lingkungan](#6-variabel-lingkungan)
7. [Database Schema (Firestore)](#7-database-schema-firestore)
8. [Alur Data & Komunikasi](#8-alur-data--komunikasi)
9. [Halaman & Fitur](#9-halaman--fitur)
10. [Komponen](#10-komponen)
11. [Services / API Layer](#11-services--api-layer)
12. [Firmware ESP32 (Hardware)](#12-firmware-esp32-hardware)
13. [Konfigurasi MQTT](#13-konfigurasi-mqtt)
14. [Aturan Bisnis Absensi](#14-aturan-bisnis-absensi)
15. [Routing](#15-routing)
16. [Known Issues & Bug Tracking](#16-known-issues--bug-tracking)
17. [Scripts & Perintah](#17-scripts--perintah)
18. [Fitur: Retained Delete Message MQTT](#18-fitur-retained-delete-message-mqtt)
19. [Fitur: Tombol Reset Manual ESP32 (GPIO 4)](#19-fitur-tombol-reset-manual-esp32-gpio-4)
20. [Riwayat Pembaruan Terakhir (Agustus 2026)](#20-riwayat-pembaruan-terakhir-agustus-2026)

---

## 1. Gambaran Umum

SIAP (*Sistem Informasi Absensi PKL*) adalah aplikasi web berbasis React yang digunakan untuk mengelola absensi peserta Praktik Kerja Lapangan (PKL) di Dinas Kominfo Kabupaten Temanggung. Sistem mencakup dua mode penempatan peserta:

- **KOMINFO** — peserta hadir di kantor Dinas Kominfo, absensi otomatis melalui alat fingerprint (ESP32 + AS608).
- **SIDEDI** (*Sistem Desa Digital*) — peserta ditempatkan di desa-desa, absensi dikonfirmasi secara manual oleh operator dashboard.

Sistem ini terintegrasi langsung dengan perangkat keras (ESP32) menggunakan protokol MQTT, sehingga proses scan sidik jari di lapangan langsung tercermin secara *real-time* di dashboard web.

---

## 2. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────┐
│                  BROWSER (React SPA)                    │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │Dashboard │  │UserManagement│  │SidediInternship │  │
│  └──────────┘  └──────────────┘  └─────────────────┘  │
│  ┌───────────────┐  ┌─────────────────────────────┐   │
│  │AttendanceHist.│  │Settings (Pengaturan)        │   │
│  └───────────────┘  └─────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐  │
│  │      ScanProcessor & MqttListener (background)   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────┬──────────────────────┬────────────────────┘
             │ Firestore SDK        │ MQTT over WSS
             ▼                      ▼
     ┌───────────────┐     ┌─────────────────────┐
     │ Firebase      │     │ HiveMQ Public Broker│
     │ Firestore     │     │ broker.hivemq.com   │
     └───────────────┘     └──────────┬──────────┘
                                      │ MQTT TCP
                                      ▼
                           ┌─────────────────────┐
                           │   ESP32 (Hardware)  │
                           │  + AS608 Fingerprint│
                           │  + HC-SR04 Proximity│
                           │  + Relay + LED + Buz│
                           └─────────────────────┘
```

**Alur utama scan fingerprint:**
1. Pengguna menempelkan jari ke sensor AS608 di ESP32.
2. ESP32 mempublish payload JSON ke topic MQTT `absensipkl_temanggung_2026/scan`.
3. `MqttListener` di browser menerima pesan dan menyimpan ke koleksi `raw_scans` Firestore dengan status `pending`.
4. `ScanProcessor` mendengarkan `raw_scans` secara *real-time*, memproses scan ke `attendance_logs`, lalu menandai status menjadi `processed`.
5. Dashboard memperbarui tampilan secara *real-time* melalui `onSnapshot` Firestore.

---

## 3. Tech Stack

| Kategori | Teknologi | Versi |
|---|---|---|
| UI Framework | React | ^19.2.7 |
| Build Tool | Vite | ^8.1.1 |
| Routing | React Router DOM | ^7.18.1 |
| Database | Firebase Firestore | ^12.15.0 |
| Realtime Messaging | MQTT.js | ^5.15.2 |
| Icons | React Icons (Lucide) | ^5.7.0 |
| Linter | oxlint | ^1.71.0 |
| Testing | Vitest + @testing-library/react | ^4.1.10 |
| Test Environment | jsdom | ^29.1.1 |
| Firmware | Arduino C++ (ESP32) | — |
| MQTT Broker | HiveMQ Public Broker | — |

---

## 4. Struktur Proyek

```
aplikasi absensi/
├── .env                          # Variabel lingkungan (tidak di-commit)
├── .env.example                  # Template env
├── .firebaserc                   # Konfigurasi Firebase project
├── firebase.json                 # Konfigurasi hosting Firebase
├── vite.config.js                # Konfigurasi Vite + Vitest
├── package.json
├── index.html
│
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   ├── logo-temanggung.png       # Logo untuk kop surat cetak
│   └── logo-temanggung.svg
│
├── src/
│   ├── main.jsx                  # Entry point React
│   ├── App.jsx                   # Root component + routing
│   ├── App.css
│   ├── index.css                 # Global styles
│   │
│   ├── firebase/
│   │   └── firebaseConfig.js     # Inisialisasi Firebase app + Firestore
│   │
│   ├── components/
│   │   ├── MqttListener.jsx      # Background: MQTT bridge (scan/enroll/delete)
│   │   ├── MqttListener1.jsx     # Versi alternatif MqttListener (legacy/backup)
│   │   ├── ScanProcessor.jsx     # Background: processor raw_scans → attendance_logs
│   │   ├── Sidebar.jsx           # Navigasi samping
│   │   ├── Modal.jsx             # Komponen modal dialog
│   │   ├── StatsCard.jsx         # Kartu statistik di dashboard
│   │   ├── StatusBadge.jsx       # Badge status kehadiran
│   │   ├── DebugButton.jsx       # Tombol melayang untuk memicu sistem debug
│   │   └── DebugLogsViewer.jsx   # Modal penampil log error & terjemahan otomatis
│   │
│   ├── data/
│   │   └── temanggungData.js     # Data statis hierarki kecamatan & desa SIDEDI
│   │
│   ├── pages/
│   │   ├── Dashboard.jsx         # Halaman utama, real-time attendance & statistik terpisah
│   │   ├── UserManagement.jsx    # CRUD peserta + proses enroll fingerprint
│   │   ├── AttendanceHistory.jsx # Riwayat absensi dengan filter tanggal
│   │   ├── SidediInternship.jsx  # Manajemen desa SIDEDI + penjadwalan & agenda
│   │   └── Settings.jsx          # Mode gelap, ukuran font, remote ESP32, & mode pengembang
│   │
│   ├── services/
│   │   ├── attendanceService.js  # Logic absensi + Firestore CRUD
│   │   ├── userService.js        # CRUD peserta, jurusan, pembimbing
│   │   ├── sidediService.js      # CRUD kecamatan/desa, jadwal, konfirmasi
│   │   ├── holidayService.js     # Sinkronisasi & caching hari libur nasional dari API
│   │   └── debugService.js       # Global error handler & pengiriman snapshot log
│   │
│   └── __tests__/
│       ├── bugExploration.test.js
│       └── preservation.test.js
│
└── esp32_fix/
    ├── esp32_fix.ino             # Firmware ESP32 (Hardware Code)
    ├── AutoSleepManager.h        # Pustaka manajemen daya/tidur otomatis
    └── BUG_EXPLORATION.md        # Dokumentasi perbaikan bug firmware
```

---

## 5. Setup & Instalasi

### Prasyarat

- Node.js ≥ 18
- npm ≥ 9
- Akun Firebase dengan proyek aktif
- (Opsional) Perangkat ESP32 dengan sensor AS608

### Langkah Instalasi

```bash
# 1. Clone atau ekstrak proyek
cd "aplikasi absensi"

# 2. Install dependensi
npm install

# 3. Salin template env dan isi nilai yang sesuai
copy .env.example .env

# 4. Jalankan development server
npm run dev
```

### Build untuk Produksi

```bash
npm run build
# Output akan masuk ke folder /dist
```

### Deploy ke Firebase Hosting

```bash
npm run build
firebase deploy
```

---

## 6. Variabel Lingkungan

Semua variabel harus diisi di file `.env` sebelum menjalankan aplikasi.
Prefix `VITE_` wajib ada agar Vite mengeksposnya ke bundle frontend.

| Variabel | Keterangan |
|---|---|
| `VITE_FIREBASE_API_KEY` | API Key dari Firebase Console |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain proyek Firebase |
| `VITE_FIREBASE_PROJECT_ID` | ID proyek Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket storage Firebase |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID untuk Firebase Cloud Messaging |
| `VITE_FIREBASE_APP_ID` | App ID dari Firebase Console |

> **Catatan keamanan:** File `.env` sudah masuk `.gitignore`. Jangan pernah commit nilai API key ke repositori.

---

## 7. Database Schema (Firestore)

Aplikasi SIAP menggunakan Firebase Firestore sebagai *NoSQL Cloud Database*. Berikut adalah struktur koleksi (*collections*) dan dokumen yang digunakan:

### 7.1. Koleksi `users`
Menyimpan data identitas peserta PKL dan status pendaftaran sidik jari.

| Field | Tipe Data | Keterangan |
|---|---|---|
| `name` | String | Nama lengkap peserta PKL |
| `institution` | String | Asal sekolah atau perguruan tinggi |
| `division` | String | Divisi penempatan (contoh: `TIK`, `STATISTIK`, `SEKRETARIAT`) |
| `major` | String | Jurusan / program studi |
| `phone` | String | Nomor telepon / WhatsApp |
| `socialMedia` | String | Akun media sosial (Instagram/LinkedIn) |
| `advisor` | String | Nama pembimbing lapangan |
| `startDate` | String (YYYY-MM-DD) | Tanggal mulai periode PKL |
| `endDate` | String (YYYY-MM-DD) | Tanggal selesai periode PKL |
| `fingerprintId` | Number \| null | ID unik sidik jari pada sensor AS608 (null saat `menunggu_enroll`) |
| `status` | String | Status pendaftaran (`menunggu_enroll`, `aktif`, `gagal_enroll`) |
| `registeredAt` | Timestamp | Waktu pendaftaran pertama di aplikasi |
| `isActive` | Boolean | Status keaktifan peserta |

### 7.2. Koleksi `raw_scans`
Menampung data mentah scan sidik jari yang dikirimkan oleh ESP32 melalui protokol MQTT sebelum diproses menjadi catatan absensi resmi.

| Field | Tipe Data | Keterangan |
|---|---|---|
| `fingerprintId` | Number | ID sidik jari yang terdeteksi oleh sensor AS608 |
| `status` | String | Status pemrosesan (`pending`, `processed`, `error`) |
| `receivedAt` | Timestamp | Waktu log scan diterima oleh `MqttListener` |
| `source` | String | Asal sumber data (contoh: `mqtt`) |
| `errorMessage` | String (opsional) | Pesan kesalahan jika terjadi kegagalan pemrosesan |

### 7.3. Koleksi `attendance_logs`
Menyimpan catatan riwayat absensi harian peserta PKL (KOMINFO maupun SIDEDI).

| Field | Tipe Data | Keterangan |
|---|---|---|
| `fingerprintId` | Number | ID sidik jari peserta |
| `userName` | String | Nama peserta absensi |
| `division` | String | Divisi peserta |
| `date` | String (YYYY-MM-DD) | Tanggal absensi |
| `checkIn` | Timestamp | Waktu scan masuk |
| `checkOut` | Timestamp \| null | Waktu scan keluar |
| `status` | String | Status kehadiran (`Hadir (KOMINFO)`, `Terlambat (KOMINFO)`, `Hadir (SIDEDI)`) |
| `location` | String | Lokasi absensi (`kominfo` atau `sidedi`) |
| `progress` | Number (opsional) | Persentase progres pekerjaan harian (khusus SIDEDI) |

### 7.4. Koleksi `districts` (Kecamatan SIDEDI)
Menyimpan data kecamatan untuk penempatan magang desa SIDEDI.

| Field | Tipe Data | Keterangan |
|---|---|---|
| `name` | String | Nama kecamatan |
| `createdAt` | Timestamp | Waktu pembuatan data kecamatan |

### 7.5. Koleksi `sidedi_locations` (Desa SIDEDI)
Menyimpan lokasi desa penempatan peserta SIDEDI di bawah kecamatan tertentu.

| Field | Tipe Data | Keterangan |
|---|---|---|
| `name` | String | Nama desa |
| `districtId` | String | Reference ID dokumen kecamatan (`districts`) |
| `createdAt` | Timestamp | Waktu penambahan lokasi desa |
| `participantIds` | Array<String> | Daftar ID user (`users`) yang ditugaskan di desa ini |

### 7.6. Koleksi `schedules` (Jadwal SIDEDI)
Menyimpan jadwal penugasan harian/mingguan peserta ke desa SIDEDI.

| Field | Tipe Data | Keterangan |
|---|---|---|
| `userId` | String | ID dokumen peserta (`users`) |
| `userName` | String | Nama peserta |
| `date` | String (YYYY-MM-DD) | Tanggal penugasan |
| `location` | String | Lokasi penugasan (`sidedi` atau `kominfo`) |
| `updatedAt` | Timestamp | Waktu pembaharuan jadwal |

### 7.7. Koleksi `majors` & `advisors`
Penyimpanan opsi pilihan dinamis untuk Jurusan dan Pembimbing pada form pendaftaran peserta.
- `majors`: `{ name: String }`
- `advisors`: `{ name: String }`

### 7.8. Koleksi `system_debug_logs`
Menyimpan snapshot log dari perangkat saat admin/pengembang mendeteksi masalah aplikasi (*crash*, *disconnect*, dll).

| Field | Tipe Data | Keterangan |
|---|---|---|
| `timestamp` | Timestamp | Waktu pengiriman laporan error/log dari klien |
| `localTime` | String | Format ISO String waktu dari peramban pengguna saat error terjadi |
| `userAgent` | String | Informasi sistem operasi dan peramban pengirim |
| `deviceType` | String | Deteksi tipe perangkat (`Mobile` / `Desktop`) |
| `onlineStatus` | String | Status jaringan internet browser (`Online` / `Offline`) |
| `mqttStatus` | String | Status koneksi Web SPA ke broker MQTT (`CONNECTED`, `DISCONNECTED`, `READING`) |
| `fingerprintStatus` | String | Status hardware pemindai sidik jari |
| `lastError` | Object \| null | Detail *stack trace* dan pesan error terakhir (jika terjadi error JS) |

---

## 8. Alur Data & Komunikasi

```
   ┌──────────────┐         MQTT (WSS)         ┌────────────────┐
   │ ESP32 Device ├───────────────────────────►│  MqttListener  │
   └──────┬───────┘                            └───────┬────────┘
          │                                            │ Writes raw scan
          │                                            ▼
   ┌──────▼──────┐   Real-time Listener        ┌────────────────┐
   │ AS608 Sensor│◄────────────────────────────┤ Firestore DB   │
   └─────────────┘   (ScanProcessor worker)    └────────────────┘
```

### 8.1. Alur Pendaftaran Sidik Jari (Enrollment Flow)
1. Admin menginput data peserta baru di halaman **User Management**.
2. Web memanggil `registerUserAndRequestEnroll()`, menyimpan user di Firestore koleksi `users` dengan status `menunggu_enroll` dan `fingerprintId: null`.
3. `MqttListener` mempublish JSON request ke topik `absensipkl_temanggung_2026/enroll_request` berisi `{ docId, name }`.
4. ESP32 menerima pesan, meminta peserta menempelkan jari 2 kali untuk registrasi di sensor AS608.
5. ESP32 mengirimkan balasan ke topik `absensipkl_temanggung_2026/enroll_result` berisi `{ docId, success: true, fingerprintId }`.
6. `MqttListener` di web menerima balasan dan memperbarui dokumen `users` (status `aktif` dan `fingerprintId` terisi).
7. **Auto-Recovery**: Jika pesan `enroll_result` terputus/gagal disimpan, `ScanProcessor` secara otomatis akan mencocokkan `fingerprintId` baru dengan peserta yang statusnya masih `menunggu_enroll`.

### 8.2. Alur Absensi Otomatis (Scan Flow)
1. Peserta menempelkan jari pada sensor AS608 di perangkat ESP32.
2. Perangkat ESP32 mempublish data ke topik `absensipkl_temanggung_2026/scan` berisi `{ fingerprintId }`.
3. Component `MqttListener` di web browser menangkap pesan dan membuat dokumen baru di Firestore koleksi `raw_scans` dengan status `pending`.
4. Component `ScanProcessor` yang mendengarkan perubahan `raw_scans` secara real-time via `onSnapshot` memicu fungsi `processAttendanceScan()`.
5. `attendanceService` mengecek record `attendance_logs`:
   - Jika belum ada log hari ini: Membuat record **CHECK IN** dengan status `Hadir (KOMINFO)` atau `Terlambat (KOMINFO)`.
   - Jika sudah ada check-in dan waktu menunjukkan di atas jam 12:00: Memperbarui record **CHECK OUT**.
6. `ScanProcessor` memperbarui status dokumen `raw_scans` dari `pending` menjadi `processed`.

### 8.3. Alur Penghapusan Sidik Jari (Delete & Clear All Flow)
- **Hapus Individu**: Admin menekan tombol hapus pada user. `publishDeleteRequest(fingerprintId)` mengirim pesan ke topik `absensipkl_temanggung_2026/delete_request`. ESP32 menghapus template sidik jari dari sensor AS608 dan membalas via `delete_result`.
- **Reset Total**: Admin memilih opsi reset seluruh sidik jari. `publishClearAllRequest()` mengirim `{ fingerprintId: "ALL" }` untuk mengosongkan memori sensor AS608.

---

## 9. Halaman & Fitur

### 9.1. Dashboard (`/`)
- **Real-Time Clock & Status Indicator**: Menampilkan jam digital serta indikator status hari kerja (Hari Kerja biasa, Hari Jumat dengan jam pulang 14:30, atau Hari Libur).
- **Statistik Kehadiran Terpisah**: Kartu statistik kini dipisah secara akurat berdasarkan lokasi penempatan: Kantor (KOMINFO) memuat *Hadir Tepat Waktu*, *Terlambat*, *Belum Masuk*, dan *Sudah Keluar*. Sedangkan Magang Desa (SIDEDI) memuat *Hadir di Desa* dan *Belum Dikonfirmasi*. Data *Izin* digabungkan secara universal.
- **Pemberian Izin Peserta**: Fitur bagi admin untuk memberikan status izin bagi peserta yang belum absen. Dilengkapi pop-up modal untuk memilih tipe izin (Sakit, Sekolah/Kampus, Lainnya) dan input keterangan/catatan spesifik.
- **Tabel Absensi Real-Time**: Daftar absensi hari ini yang diperbarui secara langsung saat scan terjadi, termasuk indikator izin (Sakit/Kampus/Lainnya) dan keterangan (jika ada).
- **Konfirmasi Absensi SIDEDI Direct**: Fitur bagi admin untuk mengonfirmasi kehadiran peserta magang SIDEDI beserta indikator progres harian (rating/persentase).
- **Cetak Rekap Global**: Fitur cetak rekapitulasi absensi berdasarkan rentang tanggal dengan format dokumen resmi kop surat Pemerintah Kabupaten Temanggung (Dinas Kominfo).

### 9.2. Manajemen Peserta (`/peserta`)
- **CRUD Peserta**: Pendaftaran peserta PKL baru yang otomatis memicu proses enroll ke alat ESP32.
- **Manajemen Jurusan & Pembimbing**: Modal kelola master data jurusan dan pembimbing lapangan.
- **Filter & Multi-Select Bulk Delete**: Fitur seleksi massal untuk menghapus data peserta dan sidik jari terdaftar.
- **Reset Total Sidik Jari**: Opsi untuk mengosongkan seluruh memori sidik jari di perangkat hardware.
- **Cetak Laporan Per Peserta**: Fitur cetak laporan kehadiran individual peserta PKL untuk lampiran nilai/sertifikat.

### 9.3. Riwayat Absensi (`/riwayat`)
- **Filter Tanggal**: Melihat riwayat absensi berdasarkan filter rentang tanggal (*Start Date* hingga *End Date*).
- **Manajemen Log Absensi**: Menampilkan lokasi absensi (KOMINFO / SIDEDI), waktu masuk, waktu keluar, status badge, dan opsi penghapusan log spesifik.

### 9.4. Magang SIDEDI (`/magang-sidedi`)
- **Manajemen Kecamatan & Desa**: Pengelolaan data hierarki Kecamatan dan Desa lokasi penempatan SIDEDI.
- **Penugasan Peserta**: Mengalokasikan peserta ke desa penempatan tertentu.
- **Penjadwalan Tugas**: Mengatur jadwal keberangkatan peserta ke lokasi desa SIDEDI per tanggal.
- **Konfirmasi Manual Attendance**: Memfasilitasi konfirmasi absensi peserta SIDEDI yang tidak menggunakan fingerprint fisik.

### 9.5. Pengaturan (`/pengaturan`)
- **Tampilan Tema**: Konfigurasi Mode Cerah (Light Mode) dan Mode Gelap (Dark Mode) secara global.
- **Ukuran Font**: Pilihan ukuran teks (Kecil, Sedang, Besar) untuk aksesibilitas, dengan fitur *live preview*.
- **Koneksi WiFi ESP32**: Fitur untuk mengganti konfigurasi jaringan (SSID dan Password) yang digunakan oleh ESP32. Memiliki dua mode komunikasi canggih:
  - **Mode Jaringan (HTTP POST)**: Mengganti WiFi melalui HTTP Request ke alamat IP ESP32.
  - **Mode Kabel (WebSerial API)**: Konfigurasi nirkontak langsung melalui kabel USB di browser tanpa perlu *Internet* atau *Serial Monitor*.
- **Reset ESP32 (MQTT)**: Opsi untuk merestart perangkat keras ESP32 dari jarak jauh jika terjadi kendala operasional, dilengkapi dengan notifikasi status keberhasilan pengiriman perintah.
- **Mode Pengembang & Debug**: Fitur lanjutan yang memungkinkan admin memunculkan tombol *floating debug* dan membuka *Log Viewer* Modal untuk memantau, menganalisis, serta menerjemahkan pesan kerusakan (error) ke bahasa manusia secara otomatis.

---

## 10. Komponen

| Komponen | Jalur File | Deskripsi / Peran |
|---|---|---|
| `App.jsx` | `src/App.jsx` | Root component, mengatur React Router DOM dan di-mount background listener (`ScanProcessor` & `MqttListener`). |
| `MqttListener.jsx` | `src/components/MqttListener.jsx` | Background worker untuk koneksi MQTT over WebSocket. Menangani receive scan/enroll/delete dan publish request ke ESP32. |
| `ScanProcessor.jsx` | `src/components/ScanProcessor.jsx` | Background worker mendengarkan koleksi `raw_scans` secara real-time (`onSnapshot`), mengolah logic absensi, dan memperbarui status dokumen. |
| `Sidebar.jsx` | `src/components/Sidebar.jsx` | Navigasi menu utama di sisi kiri aplikasi. |
| `Modal.jsx` | `src/components/Modal.jsx` | Komponen dialog overlay reusable untuk form dan konfirmasi. |
| `StatsCard.jsx` | `src/components/StatsCard.jsx` | Card widget untuk statistik ringkasan di dashboard. |
| `StatusBadge.jsx` | `src/components/StatusBadge.jsx` | Badge visual untuk menandai status kehadiran (`Hadir`, `Terlambat`, `SIDEDI`). |

---

## 11. Services / API Layer

### 11.1. `attendanceService.js`
- `subscribeToTodayAttendance(callback)`: Real-time listener data absensi hari ini.
- `processAttendanceScan(fingerprintId, userName, division)`: Logika utama menentukan check-in / check-out dan status terlambat/hadir.
- `confirmSidediAttendance(fingerprintId, userName, division, progress)`: Konfirmasi kehadiran peserta di lokasi desa SIDEDI.
- `getAttendanceByDate(date)` & `getAttendanceByDateRange(startDate, endDate)`: Mengambil data absensi untuk rekap cetak/laporan.
- `getAttendanceByFingerprintId(fingerprintId)`: Mengambil seluruh riwayat absensi milik satu peserta.
- `deleteAttendanceLog(logId)` & `deleteAllAttendanceLogs()`: Fungsi pembersihan data absensi.

### 11.2. `userService.js`
- `registerUserAndRequestEnroll(userData)`: Pendaftaran user baru dengan status `menunggu_enroll`.
- `getAllUsers()` & `getActiveUsers()`: Membaca daftar peserta dari Firestore.
- `getUserByFingerprintId(fingerprintId)`: Pencarian user berdasarkan ID sidik jari.
- `getPendingEnrollUsers()`: Mengambil daftar user yang belum menyelesaikan registrasi sidik jari.
- `updateUser(userId, userData)` & `deleteUser(userId)`: Manajemen data peserta.
- `addMajor()` / `getAllMajors()` / `deleteMajor()`: Master data Jurusan.
- `addAdvisor()` / `getAllAdvisors()` / `deleteAdvisor()`: Master data Pembimbing.

### 11.3. `sidediService.js`
- `addDistrict()` / `getAllDistricts()` / `deleteDistrict()`: CRUD Kecamatan SIDEDI.
- `addSidediLocation()` / `getAllSidediLocations()` / `deleteSidediLocation()`: CRUD Desa SIDEDI.
- `addParticipantToSidedi()` / `removeParticipantFromSidedi()`: Penugasan anggota ke desa.
- `saveSchedule()` & `getTodaySchedules(date)`: Pengelolaan jadwal penugasan harian.

### 11.4. `holidayService.js`
- `syncHolidays(year)`: Mengambil daftar tanggal merah dari API eksternal dinamis (`APIHariLibur_V2`) dan menyimpannya (caching) ke Firestore untuk meminimalkan *API call*.
- `getDayType(dateStr)`: Fungsi sentral penentu hari libur nasional, libur khusus/agenda (termasuk cuti bersama), akhir pekan (Sabtu/Minggu), atau hari kerja normal.

### 11.5. `debugService.js`
- `initGlobalErrorHandler()`: Memonitor error tak tertangani (`onerror`, `onunhandledrejection`) pada sesi aplikasi yang berjalan.
- `sendDebugSnapshot()`: Mengumpulkan data vital (koneksi, MQTT, UserAgent) lalu mengirimkannya ke koleksi `system_debug_logs`.
- `analyzeDebugLog(logData)`: Menerjemahkan data teknis dan *stack trace* menjadi panduan (*warning* / *error* / *success*) berbahasa Indonesia.
- `toggleEruda()`: Memuat *in-app DevTools Console* (`eruda`) secara *lazy-load* saat dibutuhkan (khusus debugging).

---

## 12. Firmware ESP32 (Hardware)

Firmware ESP32 berada pada folder `/absensi_pkl_hcsr04_buzzer_led__1_/absensi_pkl_hcsr04_buzzer_led__1_.ino`.

### 12.1. Komponen Perangkat Keras
- **ESP32 Microcontroller**: Modul pemroses utama dengan dukungan Wi-Fi bawaan.
- **Sensor AS608 Optical Fingerprint**: Terhubung via Serial2 UART (`RX2 = GPIO 16`, `TX2 = GPIO 17`).
- **Sensor HC-SR04 Proximity / Ultrasonik**: Mendeteksi keberadaan objek/tangan di depan alat.
- **Relay Module & Indicator**: Mengontrol indikator visual/akses fisik.
- **Buzzer & Dual LED**: Memberikan umpan balik suara dan warna (Hijau = Sukses, Merah = Gagal/Error).

### 12.2. State Machine Firmware
1. **Idle State**: Sensor ultrasonik mendeteksi jarak. Jika objek mendekat, sensor AS608 diaktifkan.
2. **Scan Mode (Default)**: Membaca sidik jari yang ditempelkan. Jika ID cocok, ESP32 mempublish JSON `{ "fingerprintId": ID }` ke topik `scan` dan membunyikan buzzer 1x.
3. **Enroll Mode**: Menerima pesan MQTT dari `enroll_request`. ESP32 meminta penempelan jari pertama dan kedua untuk verifikasi kecocokan gambar. Jika sukses, menyimpan ke EEPROM sensor AS608 dan mempublish balasan ke `enroll_result`.
4. **Delete / Clear Mode**: Menerima perintah dari `delete_request` untuk menghapus 1 ID atau mengosongkan seluruh memori sensor AS608 (`ALL`).
5. **WiFi Configuration Mode (WebServer & WebSerial)**: Menangani pergantian WiFi. Mengoperasikan WebServer pada port 80 untuk menerima `HTTP POST /save` dengan dukungan `CORS`, serta *Serial Listener* secara non-blocking di `loop()` untuk menerima perintah format CSV `SSID,PASS\n`.

---

## 13. Konfigurasi MQTT

- **Broker**: `broker.hivemq.com`
- **Port WebSocket (Web SPA)**: `wss://broker.hivemq.com:8884/mqtt`
- **Port TCP (ESP32)**: `1883`

### Topik MQTT

| Topik | Arah Komunikasi | Payload Format | Deskripsi |
|---|---|---|---|
| `absensipkl_temanggung_2026/scan` | ESP32 ➔ Web SPA | `{"fingerprintId": 5}` | Dikirim ESP32 saat sidik jari berhasil di-scan. |
| `absensipkl_temanggung_2026/enroll_request` | Web SPA ➔ ESP32 | `{"docId": "abc123", "name": "Budi"}` | Dikirim web untuk memulai proses enroll di ESP32. |
| `absensipkl_temanggung_2026/enroll_result` | ESP32 ➔ Web SPA | `{"docId": "abc123", "success": true, "fingerprintId": 5}` | Balasan status hasil enroll dari ESP32. |
| `absensipkl_temanggung_2026/delete_request` | Web SPA ➔ ESP32 | `{"fingerprintId": 5}` atau `{"fingerprintId": "ALL"}` | Perintah hapus sidik jari tertentu / reset total. |
| `absensipkl_temanggung_2026/delete_result` | ESP32 ➔ Web SPA | `{"fingerprintId": 5, "success": true}` | Balasan hasil penghapusan sidik jari. |
| `absensipkl_temanggung_2026/reset_request` | Web SPA ➔ ESP32 | `{"action": "restart", "timestamp": 1690000000}` | Perintah khusus untuk merestart module ESP32 (Remote Reset). |

--- 

## 14. Aturan Bisnis Absensi

1. **Jadwal Jam Kerja & Punctuality**:
   - **Batas Waktu Masuk**: `07:30 WIB`.
     - Scan ≤ 07:30: Status `Hadir (KOMINFO)`.
     - Scan > 07:30: Status `Terlambat (KOMINFO)`.
   - **Jam Pulang Kerja**:
     - Senin – Kamis: `16:00 WIB`.
     - Jumat: `14:30 WIB`.
2. **Ketentuan Check-Out**:
   - Absen keluar hanya diizinkan setelah jam `12:00 WIB`.
   - Scan kedua pada hari yang sama setelah jam 12:00 akan memperbarui nilai `checkOut` pada record absensi harian.
3. **Pembatasan Hari Libur**:
   - Sistem secara otomatis menolak absensi yang dilakukan pada hari Sabtu (6) dan Minggu (0).
4. **Magang SIDEDI**:
   - Absensi peserta SIDEDI dikonfirmasi manual via dashboard dengan waktu default masuk `07:00` dan keluar `16:00` serta status `Hadir (SIDEDI)`.
5. **Perizinan & Ketidakhadiran (Izin)**:
   - Peserta magang yang tidak dapat hadir (belum melakukan scan pada hari bersangkutan) dapat diberikan izin melalui Dashboard.
   - Tipe izin yang diakomodasi: **Sakit (S)**, **Panggilan Sekolah/Kampus (K)**, dan **Lainnya (I)**.
   - Izin dicatat dengan waktu check-in dan check-out kosong (`null`), berstatus `Izin (Tipe)`, dan menyertakan field `leaveNote`.

---

## 15. Routing

Aplikasi menggunakan `react-router-dom` v7.

| Path | Component | Halaman |
|---|---|---|
| `/` | `<Dashboard />` | Ringkasan absensi real-time, statistik, cetak rekap global. |
| `/peserta` | `<UserManagement />` | Kelola peserta, enroll sidik jari, cetak laporan individu. |
| `/riwayat` | `<AttendanceHistory />` | Log riwayat absensi terfilter rentang tanggal. |
| `/magang-sidedi` | `<SidediInternship />` | Manajemen lokasi desa SIDEDI, penjadwalan & penugasan. |
| `/pengaturan` | `<Settings />` | Konfigurasi tema visual, ukuran font, dan remote reset ESP32. |

---

## 16. Known Issues & Bug Tracking

1. **Firestore REST Serialization Handling in `ScanProcessor`**:
   - Firestore SDK me-return angka numerik `fingerprintId` dari REST API / triggers terkadang sebagai string atau number. `ScanProcessor` telah disesuaikan dengan melakukan eksplisit conversion `Number(scanData.fingerprintId)` untuk mencegah mismatch tipe data.
2. **Auto-Recovery Enroll Result Lost**:
   - Jika sinyal MQTT terputus saat ESP32 selesai melakukan enroll, `ScanProcessor` menyediakan mekanisme fallback otomatis: jika ada scan dari ID baru yang belum terdaftar di `users`, sistem menautkannya ke user terlama yang berstatus `menunggu_enroll`.
3. **Vitest Status String Compatibility**:
   - Dalam pengujian unit (`preservation.test.js`), status absensi tersimpan sebagai string spesifik lokasi (contoh: `Hadir (KOMINFO)`). Pengujian yang mengekspektasikan nilai generik `Hadir` harus disesuaikan agar sesuai dengan spesifikasi aplikasi SIAP terkini.

---

## 17. Scripts & Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan local development server Vite (port default 5173). |
| `npm run build` | Melakukan kompilasi bundle produksi ke folder `/dist`. |
| `npm run preview` | Menjalankan preview lokal dari hasil build folder `/dist`. |
| `npm run lint` | Menjalankan pemindaian linter dengan `oxlint`. |
| `npm run test` | Menjalankan seluruh pengujian unit secara sekali jalan (`vitest run`). |
| `npm run test:watch` | Menjalankan unit test Vitest dalam mode watch interaktif. |

---

## 18. Fitur: MQTT Retained Delete (Auto-Sync saat ESP32 Boot)

### Latar Belakang Masalah

Ketika admin menghapus data peserta dari dashboard web saat ESP32 **sedang mati / reboot**, perintah hapus dikirim via MQTT tetapi tidak ada penerima. Akibatnya:

- Data peserta terhapus dari Firebase ✓
- Template sidik jari di sensor AS608 **tidak terhapus** ✗
- Slot ID lama masih dianggap "terpakai" oleh ESP32 ✗
- Scan sidik jari orang yang sama akan cocok ke ID lama ✗

### Solusi: MQTT Retained Message

Perintah hapus (`delete_request`) kini dikirim dengan flag **`retain: true`** dan **`qos: 1`**. Broker HiveMQ menyimpan pesan ini secara permanen hingga dikonfirmasi selesai diproses.

**Alur kerja:**

```
Admin klik "Hapus User" / "Hapus Semua" (ESP32 sedang reboot)
  │
  ▼
Web publish ke topic delete_request
  { fingerprintId: X }  ←  retain: true, qos: 1
  │
  ▼
HiveMQ Broker menyimpan pesan (retained) ─────────────────────────┐
                                                                    │
ESP32 selesai boot → connect MQTT → subscribe delete_request       │
  ◄──── Broker langsung kirim retained message ────────────────────┘
  │
  ▼
onMqttMessage() → prosesHapusTemplate(X) atau prosesHapusSemua()
  → finger.deleteModel(X) / finger.emptyDatabase()
  → slotTerpakai[X] = false
  → kirim delete_result { success: true }
  │
  ▼
Web terima delete_result sukses
  → publish('', retain: true) ke delete_request ← hapus retained di broker
  → Firebase dihapus
```

### File yang Diubah

| File | Fungsi | Perubahan |
|---|---|---|
| `src/components/MqttListener.jsx` | `publishDeleteRequest()` | Tambah `{ retain: true, qos: 1 }` |
| `src/components/MqttListener.jsx` | `publishClearAllRequest()` | Tambah `{ retain: true, qos: 1 }` |
| `src/components/MqttListener.jsx` | `handleDeleteResult()` | Clear retained setelah konfirmasi sukses |

### Catatan

- HiveMQ hanya menyimpan **1 retained message per topic**. Untuk hapus banyak user saat ESP32 offline, gunakan **Hapus Semua** (`fingerprintId: "ALL"`) yang lebih andal.
- **Tidak ada perubahan firmware ESP32** — mekanisme existing sudah cukup menangani retained message.

---

## 19. Fitur: Tombol Reset Manual ESP32 (GPIO 4)

### Deskripsi

Tombol fisik yang terhubung ke **GPIO 4** ESP32 berfungsi sebagai *hard restart* perangkat tanpa perlu cabut-colok daya atau akses Serial Monitor. Berguna saat sistem hang atau tidak merespons.

### Spesifikasi Hardware

| Parameter | Nilai |
|---|---|
| GPIO | 4 |
| Wiring | Push button → GPIO 4 → GND |
| Mode | `INPUT_PULLUP` (aktif LOW) |
| Konflik pin | Tidak ada (aman) |

### Perilaku

1. Tombol ditekan → LCD tampil `Reset Manual / Mohon tunggu...`
2. Buzzer berbunyi selama **1500 ms**
3. Buzzer mati → `ESP.restart()` dipanggil
4. ESP32 reboot penuh — **data sidik jari di AS608 tidak terhapus**
5. Setelah boot: `sinkronisasiSlotDariSensor()` otomatis rebuild cache dari sensor

### File yang Diubah

| File | Lokasi | Perubahan |
|---|---|---|
| `esp32_fix/esp32_fix.ino` | Deklarasi pin | Tambah `#define RESET_BUTTON_PIN 4` |
| `esp32_fix/esp32_fix.ino` | `setupTambahanHardware()` | Tambah `pinMode(RESET_BUTTON_PIN, INPUT_PULLUP)` |
| `esp32_fix/esp32_fix.ino` | `loop()` — awal fungsi | Tambah blok cek `digitalRead(RESET_BUTTON_PIN) == LOW` |

---

## 20. Riwayat Pembaruan Terakhir (Agustus 2026)

### 20.1. Fitur Debugging & Log Viewer Sistem
- **Latar Belakang**: Memudahkan pelacakan masalah/error pada perangkat PC maupun Mobile saat digunakan di lapangan tanpa memerlukan koneksi kabel debugging.
- **Implementasi Utama**:
  - **`src/services/debugService.js`**: Menangkap error JavaScript global (`window.onerror` & `onunhandledrejection`), mengabaikan *benign* `AbortError` (`event.preventDefault()`), mengintegrasikan Eruda Console secara dinamis dari CDN, serta mengirimkan snapshot kondisi sistem ke Firestore koleksi `system_debug_logs`.
  - **`src/components/DebugButton.jsx`**: Tombol melayang di pojok kanan bawah dengan notifikasi *toast* untuk mengambil snapshot dan memuat Eruda.
  - **`src/components/DebugLogsViewer.jsx`**: Jendela dialog (Modal) untuk membaca daftar laporan snapshot di Firestore dan menerjemahkan masalah (*Stack Trace*, status MQTT/Fingerprint, koneksi internet) ke bahasa Indonesia secara otomatis via fungsi `analyzeDebugLog`.
  - **`src/pages/Settings.jsx`**: Penambahan segmen "Mode Pengembang & Debug" yang dilengkapi *toggle switch* (On/Off) untuk mengontrol visibilitas tombol debug dan membuka Log Viewer.

### 20.2. Migrasi Hari Libur & Penjadwalan Agenda Dinamis
- **Latar Belakang**: Mengganti data tanggal merah statis menjadi dinamis dan fleksibel.
- **Implementasi Utama**:
  - **`src/services/holidayService.js`**: Mengintegrasikan API eksternal `guangrei/APIHariLibur_V2` untuk sinkronisasi otomatis tanggal merah dan cuti bersama ke Firestore.
  - **`src/pages/SidediInternship.jsx`**: Penambahan fitur "Agenda Hari" pada tab Penjadwalan SIDEDI, memungkinkan admin menambahkan penanda hari penting/libur kustom beserta kategorinya.

### 20.3. Pembersihan Antarmuka (Clean UI)
- **Pembersihan Emotikon**: Mengeliminasi penggunaan simbol emoji berlebih (seperti 🐛 pada tombol debug dan 🤒/🏫/📋 pada badge status izin `StatusBadge.jsx`) agar tampilan antarmuka terkesan lebih bersih, resmi, dan profesional.

### 20.4. Restrukturisasi Statistik Dashboard
- **Latar Belakang**: Terdapat anomali perhitungan pada statistik "Belum Masuk" yang sebelumnya hanya mengandalkan selisih jumlah total tanpa membedakan status jadwal khusus.
- **Implementasi Utama**: 
  - Memisahkan blok tampilan menjadi **Kantor (KOMINFO)** dan **Magang Desa (SIDEDI)** pada `Dashboard.jsx`.
  - Memperbaiki logika filter untuk menghitung nilai pasti:
    - **Hadir / Terlambat**: Sekarang melacak teks awal `Hadir (KOMINFO)` vs `Hadir (SIDEDI)`.
    - **Belum Dikonfirmasi (SIDEDI)**: Mengekstrak peserta yang hari ini punya jadwal SIDEDI namun belum ada rekaman absensi apa pun (Hadir/Izin).
    - **Belum Masuk (KOMINFO)**: Mengekstrak peserta dari daftar aktif yang *tidak* memiliki jadwal SIDEDI hari ini dan belum absensi masuk.

