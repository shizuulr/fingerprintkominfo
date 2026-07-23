# SIAP — Sistem Informasi Absensi PKL

**Dinas Komunikasi dan Informatika (Diskominfo) Kabupaten Temanggung**

SIAP (*Sistem Informasi Absensi PKL*) adalah aplikasi web manajemen absensi real-time berbasis React 19, Firebase Firestore, dan protokol MQTT yang terintegrasi langsung dengan perangkat keras pemindai sidik jari berbasis ESP32.

---

## 🌟 Fitur Utama

- **Real-Time Attendance Monitoring**: Pemrosesan absensi masuk dan keluar secara otomatis melalui sensor sidik jari AS608 & MQTT broker.
- **Dual Placement Mode**:
  - **KOMINFO**: Kehadiran fisik di kantor Diskominfo via pemindai sidik jari.
  - **SIDEDI (Sistem Desa Digital)**: Penempatan magang di desa-desa dengan konfirmasi kehadiran manual & progres pekerjaan.
- **Manajemen Peserta & Pendaftaran Fingerprint**: Input data peserta dan proses registrasi sidik jari ke ESP32 secara nirkabel.
- **Cetak Laporan & Kop Surat Resmi**: Fitur ekspor laporan absensi (global dan individual) lengkap dengan Kop Surat resmi Dinas Kominfo Kabupaten Temanggung.
- **Auto-Recovery & Background Workers**: Pemrosesan scan dan pemulihan data pendaftaran secara otomatis via background listener.

---

## 🚀 Tech Stack

- **Frontend**: React 19, React Router DOM 7, Vite 8, React Icons (Lucide)
- **Database**: Firebase Firestore (NoSQL Cloud Database)
- **Real-Time Messaging**: MQTT.js (WebSocket WSS over HiveMQ Broker)
- **Quality & Testing**: Vitest, React Testing Library, Oxlint
- **Hardware**: ESP32 Microcontroller, Sensor AS608 Fingerprint, Sensor HC-SR04 Proximity, Relay, Buzzer, LED

---

## 🛠️ Panduan Instalasi & Penggunaan

### 1. Prasyarat
- Node.js ≥ 18
- npm ≥ 9

### 2. Langkah Quick Start

```bash
# Clone atau ekstrak proyek
cd "aplikasi absensi"

# Install dependensi
npm install

# Konfigurasi variabel lingkungan
copy .env.example .env
# Edit file .env dan isi dengan Firebase API Key milik Anda

# Jalankan server pengembangan lokal
npm run dev
```

### 3. Variabel Lingkungan (.env)

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 🧪 Perintah Pengujian & Linting

```bash
# Jalankan pengujian unit
npm run test

# Jalankan linter
npm run lint

# Build untuk produksi
npm run build
```

---

## 📖 Dokumentasi Lengkap

Untuk dokumentasi teknis mendalam mengenai skema database Firestore, alur komunikasi MQTT, spesifikasi firmware ESP32, aturan bisnis jam kerja, dan arsitektur komponen, silakan baca **[DOCUMENTATION.md](file:///c:/kuliah/lainya/semangat%20kp/aplikasi%20absensi/DOCUMENTATION.md)**.
