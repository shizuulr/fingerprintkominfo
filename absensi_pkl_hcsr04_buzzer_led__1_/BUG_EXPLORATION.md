# BUG_EXPLORATION.md — Eksplorasi Bug 1: Cache Slot Tidak Disinkronkan Saat Boot

**Status:** Kondisi bug TERKONFIRMASI pada firmware asli (belum diperbaiki)
**Tanggal:** 2026-07-10
**Task:** Task 1 — Tulis tes eksplorasi kondisi bug (SEBELUM implementasi perbaikan)
**Validates:** Requirements 1.1, 1.2, 1.3

---

## Ringkasan Bug

Array `slotTerpakai[]` di ESP32 **selalu dimulai kosong** setiap kali perangkat restart atau dinyalakan ulang. Fungsi `cariIdKosongCepat()` mencari ID kosong mulai dari 1 tanpa tahu template mana yang sudah tersimpan di memori fisik sensor AS608. Akibatnya, proses enroll berisiko menimpa template lama yang sudah ada.

---

## Lokasi Bug di Kode

**File:** `absensi_pkl_hcsr04_buzzer_led__1_.ino`

### Deklarasi Array — Selalu Kosong

```cpp
// Baris ~72 — array cache slot
const int MAX_ID = 200;
bool slotTerpakai[MAX_ID + 1] = { false };  // ← selalu false semua saat boot
String namaUser[MAX_ID + 1];
```

Array `slotTerpakai` dideklarasikan dengan inisialisasi statis `{ false }`, artinya **setiap kali ESP32 restart**, semua elemen kembali ke `false` — tidak ada persistensi ke EEPROM atau NVS, dan tidak ada sinkronisasi dari sensor.

---

## Jalur Kode yang Bermasalah (Code Path)

### `setup()` → `finger.getTemplateCount()` → BERHENTI di sini

```cpp
void setup() {
  // ... inisialisasi LCD, hardware, sensor ...

  // [1] Cek apakah sensor AS608 merespons
  if (finger.verifyPassword()) {
    Serial.println("Sensor AS608 terdeteksi.");
  } else {
    // error handling
  }

  // [2] Hanya ambil JUMLAH template — tidak ada info tentang ID mana yang terisi
  finger.getTemplateCount();
  Serial.print("Template tersimpan di sensor: ");
  Serial.println(finger.templateCount);
  // ↑ finger.templateCount = 3 (misalnya), tapi kita tidak tahu ID berapa saja

  // [3] TIDAK ADA iterasi finger.loadModel(id) untuk sinkronisasi slotTerpakai[]
  // Harusnya ada loop:
  //   for (int id = 1; id <= MAX_ID; id++) {
  //     if (finger.loadModel(id) == FINGERPRINT_OK) {
  //       slotTerpakai[id] = true;
  //     }
  //   }

  connectWiFi();
  // ... sisa setup ...
}
```

**Masalah:** `finger.getTemplateCount()` hanya mengembalikan **jumlah** template (misalnya: 3), bukan **daftar ID** yang terisi. Setelah baris ini, `slotTerpakai[]` masih seluruhnya `false`.

---

### `cariIdKosongCepat()` — Selalu Mengembalikan ID 1

```cpp
int cariIdKosongCepat() {
  for (int id = 1; id <= MAX_ID; id++) {
    if (!slotTerpakai[id]) return id;  // ← slotTerpakai semua false → selalu return 1
  }
  return -1;
}
```

Karena `slotTerpakai[]` seluruhnya `false` setelah restart, **iterasi pertama langsung menemukan ID 1 sebagai "kosong"** dan langsung return — padahal ID 1 mungkin sudah memiliki template tersimpan di sensor fisik.

---

### `prosesEnroll()` — Menggunakan ID yang Salah

```cpp
void prosesEnroll() {
  // ...
  int idKosong = cariIdKosongCepat();  // ← mengembalikan ID 1 (SALAH setelah restart)
  // ...

  int hasil = enrollFingerprint(idKosong);  // ← menyimpan template baru di ID 1

  if (hasil == FINGERPRINT_OK) {
    slotTerpakai[idKosong] = true;   // ID 1 ditandai terpakai (terlambat)
    namaUser[idKosong] = enrollNamaAktif;
    kirimHasilEnroll(true, idKosong);  // ← mengirim fingerprintId=1 ke web
  }
}
```

Template baru disimpan ke ID 1 menggunakan `finger.storeModel(id)`, yang **menimpa template lama** yang ada di slot ID 1 sensor fisik.

---

## Counterexample yang Diharapkan

### Skenario Konkret: Restart Overwrite Test

**Kondisi awal sebelum restart:**
- Sensor AS608 memiliki 3 template tersimpan: ID 1 (Budi), ID 2 (Siti), ID 3 (Ahmad)
- `slotTerpakai[1..3]` = `true` *(saat ESP32 pertama kali menyala dan enroll)*
- `namaUser[1]` = "Budi", `namaUser[2]` = "Siti", `namaUser[3]` = "Ahmad"

**Tindakan: Restart ESP32**

**State setelah restart (kondisi bug):**
```
slotTerpakai[0]   = false
slotTerpakai[1]   = false  ← BUG: seharusnya true (Budi ada di sini)
slotTerpakai[2]   = false  ← BUG: seharusnya true (Siti ada di sini)
slotTerpakai[3]   = false  ← BUG: seharusnya true (Ahmad ada di sini)
slotTerpakai[4..200] = false

finger.templateCount = 3   (hasil getTemplateCount() — hanya jumlah, bukan ID)
```

**Tindakan: Web mendaftarkan user baru "Reza" → MQTT enroll_request dikirim**

**Eksekusi `cariIdKosongCepat()`:**
```
id=1: slotTerpakai[1] = false → return 1  ← SALAH, ID 1 sudah ada template Budi
```

**Eksekusi `enrollFingerprint(1)`:**
- `finger.storeModel(1)` dipanggil dengan jari Reza
- Template **BUDI DITIMPA** oleh template Reza di slot ID 1

**Hasil yang dikirim ke web:**
```json
{ "docId": "reza-doc-id", "success": true, "fingerprintId": 1 }
```

**Konsekuensi:**
1. Reza berhasil enroll dengan ID 1
2. Budi mencoba absen → sensor cocok dengan template Reza (jika mirip) atau tidak cocok sama sekali
3. Budi **kehilangan akses absensi** meskipun datanya masih ada di Firestore
4. Jika threshold sensor longgar, jari Reza bisa cocok dengan siapa saja yang pernah menempati ID 1

---

## Verifikasi Manual (Output Serial Monitor)

Ketika ESP32 di-restart dengan sensor berisi 3 template, output Serial Monitor kode asli:

```
Sensor AS608 terdeteksi.
Template tersimpan di sensor: 3
```

**Yang TIDAK muncul (karena bug):**
```
Sinkronisasi slot dari sensor...   ← tidak ada kode ini
Slot terisi: ID 1, 2, 3            ← tidak ada kode ini
Total slot terisi: 3               ← tidak ada kode ini
```

**Setelah perbaikan, output yang diharapkan:**
```
Sensor AS608 terdeteksi.
Template tersimpan di sensor: 3
Sinkronisasi slot dari sensor...
  ID 1: terisi
  ID 2: terisi
  ID 3: terisi
Total slot terisi: 3 dari 200
```

---

## Kondisi Bug Formal

```
FUNCTION isBugCondition_Boot(state)
  INPUT: state — kondisi sistem saat proses enroll berjalan
  OUTPUT: boolean

  RETURN state.slotTerpakai SEMUA false
         AND state.sensor.templateCount > 0
         AND state.cariIdKosongCepat() MENGEMBALIKAN id YANG
             state.sensor.templateExistsAt(id) == true
END FUNCTION
```

Pada kode asli:
- `state.slotTerpakai` = semua `false` setelah restart ✓ (kondisi bug terpenuhi)
- `state.sensor.templateCount` = 3 (ada template) ✓ (kondisi bug terpenuhi)
- `cariIdKosongCepat()` = 1, tapi `sensor.templateExistsAt(1)` = true ✓ (kondisi bug terpenuhi)

**→ `isBugCondition_Boot` = `true` — bug terkonfirmasi**

---

## Dampak dan Risiko

| Skenario | Dampak |
|----------|--------|
| Restart setelah 3 enroll | Enroll ke-4 menimpa template ID 1 |
| Restart setelah 50 enroll | Enroll ke-51 menimpa template ID 1, ke-52 menimpa ID 2, dst. |
| Sensor punya template tidak berurutan (1, 3, 5) | `cariIdKosongCepat()` mengembalikan 1 — menimpa template yang ada |
| Jari yang ditimpa mencoba absen | Tidak cocok dengan siapapun — "Tidak Dikenali" |
| Threshold sensor longgar | Jari orang lain bisa cocok dengan ID 1 |

---

## Perbaikan yang Diperlukan

Tambahkan fungsi `sinkronisasiSlotDariSensor()` dan panggil di `setup()` setelah `finger.getTemplateCount()`:

```cpp
void sinkronisasiSlotDariSensor() {
  Serial.println("Sinkronisasi slot dari sensor...");
  int jumlahTerisi = 0;
  for (int id = 1; id <= MAX_ID; id++) {
    if (finger.loadModel(id) == FINGERPRINT_OK) {
      slotTerpakai[id] = true;
      Serial.println("  ID " + String(id) + ": terisi");
      jumlahTerisi++;
    }
  }
  Serial.println("Total slot terisi: " + String(jumlahTerisi) + " dari " + String(MAX_ID));
  sinkronisasiSelesai = true;
}
```

Detail implementasi perbaikan ada di Task 3 (tasks.md).

---

## Referensi

- **Requirements:** 1.1 (sinkronisasi saat boot), 1.2 (guard enroll), 1.3 (jumlah slot akurat), 1.4 (debug Serial)
- **Design:** section "Bug 1 — Kondisi Bug: Cache Slot Tidak Disinkronkan Saat Boot"
- **Fungsi terdampak:** `setup()`, `cariIdKosongCepat()`, `prosesEnroll()`
- **Library:** `Adafruit_Fingerprint` — `finger.loadModel(id)` mengembalikan `FINGERPRINT_OK` jika template ada
