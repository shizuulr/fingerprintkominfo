/*
  =====================================================================
  ABSENSI PKL - VERSI HARDWARE FISIK (ESP32 + AS608 + MQTT)
  + TAMBAHAN: HC-SR04 (deteksi tangan mendekat) -> RELAY daya AS608
              BUZZER (beep 1x sukses / 3x gagal)
              3 LED INDIKATOR (maintenance / sukses / gagal)
  =====================================================================
  CATATAN PENTING:
  - Semua logic MQTT, enroll, LCD, dan absen ASLI TIDAK DIUBAH.
  - Yang ditambahkan:
      1) Fungsi kelolaDayaAS608danIndikator() -> baca HC-SR04, kontrol
         relay daya AS608, kedipkan LED1 saat mode standby/"maintenance".
      2) Guard di loop() supaya cekAbsenOtomatis() cuma dipanggil saat
         AS608 sudah diberi daya & sudah lewat masa boot delay.
      3) Guard di prosesEnroll() (dipanggil di awal) supaya AS608
         dipaksa menyala dulu sebelum proses enroll jalan, karena
         enroll butuh sensor aktif kapanpun web minta, tidak tergantung
         HC-SR04.
      4) 1 baris pemanggilan tandaSuksesFingerprint() di titik sukses
         cekAbsenOtomatis(), dan 1 baris tandaGagalFingerprint() di
         titik gagal (tidak dikenali). Isi logic asli di sekitarnya
         tidak diubah.
  =====================================================================
  ALUR:
  1. Pendaftaran dimulai dari web -> web publish MQTT ke 'enroll_request'
  2. ESP32 terima request -> cari ID kosong -> proses enroll 2 tahap
  3. ESP32 publish hasil ke 'enroll_result' (docId + fingerprintId baru)
  4. Untuk absen: user tempel jari kapan saja -> otomatis dicari
     kecocokannya -> publish ke 'scan' seperti sistem sebelumnya
  =====================================================================
  WIRING TAMBAHAN
  =====================================================================
  HC-SR04:
    TRIG -> GPIO32
    ECHO -> GPIO35 (input-only pin, aman untuk baca ECHO)

  RELAY (memutus/menyambung jalur VCC AS608):
    IN     -> GPIO25
    COM/NO -> jalur VCC AS608

  BUZZER (aktif langsung, bukan lewat relay):
    + -> GPIO26

  LED INDIKATOR:
    LED1 (maintenance/standby, AS608 mati) -> GPIO27
    LED2 (fingerprint sukses)              -> GPIO14
    LED3 (fingerprint gagal)               -> GPIO12
  =====================================================================
*/
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_Fingerprint.h>

// ---------- LCD ----------
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---------- SENSOR FINGERPRINT ----------
HardwareSerial fingerSerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&fingerSerial);

// ---------- WIFI ----------
const char* WIFI_SSID = "STATISTIK";      // GANTI sesuai jaringan asli
const char* WIFI_PASS = "st4t1st1k";  // GANTI sesuai jaringan asli

// ---------- MQTT ----------
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT = 1883;
const char* TOPIC_ENROLL_REQUEST = "absensipkl_temanggung_2026/enroll_request";
const char* TOPIC_ENROLL_RESULT  = "absensipkl_temanggung_2026/enroll_result";
const char* TOPIC_SCAN           = "absensipkl_temanggung_2026/scan";
const char* TOPIC_DELETE_REQUEST = "absensipkl_temanggung_2026/delete_request";
const char* TOPIC_DELETE_RESULT  = "absensipkl_temanggung_2026/delete_result";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ---------- CACHE LOKAL ----------
const int MAX_ID = 200;   // sesuaikan dengan finger.capacity setelah dicek
bool slotTerpakai[MAX_ID + 1] = { false };
String namaUser[MAX_ID + 1];
bool sinkronisasiSelesai = false;

// Menyimpan permintaan enroll yang sedang diproses (dari MQTT)
String enrollDocIdAktif = "";
String enrollNamaAktif = "";
bool adaPermintaanEnroll = false;

// Antrian perintah hapus template dari web
int deleteFingerprintIdAntrian = -1;
bool adaPermintaanHapus = false;
bool adaPermintaanHapusSemua = false;

// =====================================================================
// >>> TAMBAHAN: HC-SR04 + RELAY DAYA AS608 + BUZZER + 3 LED <<<
// =====================================================================

// ---------- PIN HC-SR04 ----------
#define TRIG_PIN   32
#define ECHO_PIN   35

// ---------- PIN RELAY DAYA AS608 ----------
#define RELAY_AS608_PIN  25
// Ganti ke false kalau modul relaymu aktif HIGH (bukan aktif LOW)
const bool RELAY_AKTIF_LOW = true;

// ---------- PIN BUZZER ----------
#define BUZZER_PIN 26
const bool BUZZER_AKTIF_LOW = false; // ganti true kalau buzzermu aktif LOW

// ---------- PIN LED INDIKATOR ----------
#define LED_MAINTENANCE  27  // berkedip pelan saat AS608 mati (standby)
#define LED_SUKSES       14  // menyala saat fingerprint berhasil dikenali
#define LED_GAGAL        12  // menyala saat fingerprint tidak dikenali

// ---------- KONFIGURASI JARAK & WAKTU ----------
const float AMBANG_JARAK_CM        = 15.0;  // jarak dianggap "tangan mendekat"
const unsigned long INTERVAL_BACA_JARAK_MS = 100;
const unsigned long BOOT_DELAY_AS608_MS    = 600;  // jeda AS608 siap setelah dikasih daya
const unsigned long INTERVAL_BLINK_LED1_MS = 700;  // kecepatan kedip pelan LED1
// (LED2/LED3 tidak pakai durasi terpisah lagi -- nyala/mati disamakan
// persis dengan durasi buzzer, lihat tandaSuksesFingerprint() &
// tandaGagalFingerprint() di bawah)

// ---------- STATE TAMBAHAN ----------
unsigned long waktuBacaJarakTerakhir = 0;
unsigned long waktuBlinkLED1Terakhir = 0;
bool statusLED1 = false;

bool as608Bertenaga = false;       // status relay saat ini (true = AS608 nyala)
unsigned long waktuAS608Dinyalakan = 0;
bool as608SudahSiap = false;       // sudah lewat BOOT_DELAY_AS608_MS sejak nyala

void setupTambahanHardware() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  pinMode(RELAY_AS608_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_MAINTENANCE, OUTPUT);
  pinMode(LED_SUKSES, OUTPUT);
  pinMode(LED_GAGAL, OUTPUT);

  buzzerDiam();
  digitalWrite(LED_MAINTENANCE, LOW);
  digitalWrite(LED_SUKSES, LOW);
  digitalWrite(LED_GAGAL, LOW);

  // Nyalakan AS608 dulu di awal supaya proses verifyPassword() di setup()
  // asli bisa jalan normal (sensor butuh daya untuk merespons).
  nyalakanAS608();
  delay(BOOT_DELAY_AS608_MS);
  as608SudahSiap = true;
}

float bacaJarakCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long durasi = pulseIn(ECHO_PIN, HIGH, 25000); // timeout 25ms (~4m)
  if (durasi == 0) return 999.0; // tidak ada pantulan -> anggap sangat jauh

  return (durasi * 0.0343) / 2.0; // konversi ke cm
}

void nyalakanAS608() {
  digitalWrite(RELAY_AS608_PIN, RELAY_AKTIF_LOW ? LOW : HIGH);
  if (!as608Bertenaga) {
    waktuAS608Dinyalakan = millis();
    as608SudahSiap = false;
  }
  as608Bertenaga = true;
}

void matikanAS608() {
  digitalWrite(RELAY_AS608_PIN, RELAY_AKTIF_LOW ? HIGH : LOW);
  as608Bertenaga = false;
  as608SudahSiap = false;
}

// Dipanggil tiap loop: mengatur daya AS608 berdasar jarak HC-SR04,
// dan mengedipkan LED1 pelan selama mode standby/"maintenance".
void kelolaDayaAS608danIndikator() {
  if (millis() - waktuBacaJarakTerakhir >= INTERVAL_BACA_JARAK_MS) {
    waktuBacaJarakTerakhir = millis();
    float jarak = bacaJarakCM();
    bool tanganMendekat = (jarak <= AMBANG_JARAK_CM);

    if (tanganMendekat) {
      if (!as608Bertenaga) nyalakanAS608();
    } else {
      if (as608Bertenaga) matikanAS608();
    }
  }

  // Cek apakah AS608 sudah lewat masa boot delay sejak dinyalakan
  if (as608Bertenaga && !as608SudahSiap) {
    if (millis() - waktuAS608Dinyalakan >= BOOT_DELAY_AS608_MS) {
      as608SudahSiap = true;
    }
  }

  // LED1 berkedip pelan HANYA saat AS608 mati (mode standby/"maintenance")
  if (!as608Bertenaga) {
    if (millis() - waktuBlinkLED1Terakhir >= INTERVAL_BLINK_LED1_MS) {
      waktuBlinkLED1Terakhir = millis();
      statusLED1 = !statusLED1;
      digitalWrite(LED_MAINTENANCE, statusLED1 ? HIGH : LOW);
    }
  } else {
    digitalWrite(LED_MAINTENANCE, LOW);
    statusLED1 = false;
  }
}

void buzzerBunyi() {
  digitalWrite(BUZZER_PIN, BUZZER_AKTIF_LOW ? LOW : HIGH);
}
void buzzerDiam() {
  digitalWrite(BUZZER_PIN, BUZZER_AKTIF_LOW ? HIGH : LOW);
}

// Dipanggil saat fingerprint BERHASIL dikenali:
// LED2 menyala BARENGAN dengan buzzer bunyi selama 1 detik penuh, lalu sama-sama mati.
void tandaSuksesFingerprint() {
  digitalWrite(LED_GAGAL, LOW);
  digitalWrite(LED_SUKSES, HIGH);
  buzzerBunyi();

  delay(1000);

  buzzerDiam();
  digitalWrite(LED_SUKSES, LOW);
}

// Dipanggil saat fingerprint GAGAL/tidak dikenali:
// LED3 + buzzer nyala-mati BARENGAN, tiap fase 500ms, diulang 3x (total 3 detik).
void tandaGagalFingerprint() {
  digitalWrite(LED_SUKSES, LOW);

  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_GAGAL, HIGH);
    buzzerBunyi();
    delay(500);

    digitalWrite(LED_GAGAL, LOW);
    buzzerDiam();
    delay(500);
  }
}

// =====================================================================
// >>> AKHIR BAGIAN TAMBAHAN <<<
// =====================================================================

// =========================================================
// SINKRONISASI SLOT DARI SENSOR (dipanggil sekali di setup)
// =========================================================
void sinkronisasiSlotDariSensor() {
  Serial.println("Sinkronisasi slot dari sensor...");
  tampilkanLCD("Sinkronisasi...", "Mohon tunggu");

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

void setup() {
  Serial.begin(115200);
  delay(100);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  tampilkanLCD("Absensi PKL", "Inisialisasi...");

  // >>> TAMBAHAN: siapkan HC-SR04, relay, buzzer, LED, dan nyalakan
  // AS608 lebih dulu supaya verifyPassword() di bawah ini bisa jalan.
  setupTambahanHardware();

  // Inisialisasi sensor
  fingerSerial.begin(57600, SERIAL_8N1, 16, 17);
  delay(1000);
  if (finger.verifyPassword()) {
    Serial.println("Sensor AS608 terdeteksi.");
  } else {
    Serial.println("GAGAL: Sensor tidak merespons.");
    tampilkanLCD("Sensor Error", "Cek wiring!");
    while (1) { delay(1000); }
  }

  // Sinkronkan jumlah template yang sudah ada di sensor
  finger.getTemplateCount();
  Serial.print("Template tersimpan di sensor: ");
  Serial.println(finger.templateCount);

  // Sinkronisasi cache slot dari sensor fisik
  sinkronisasiSlotDariSensor();
  tampilkanLCD("Sistem Siap", "Tempel Jari");

  connectWiFi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  connectMQTT();

  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  // >>> TAMBAHAN: kelola daya AS608 (via HC-SR04) + LED maintenance,
  // dipanggil tiap loop, non-blocking.
  kelolaDayaAS608danIndikator();

  // Kalau ada permintaan enroll masuk dari web, proses dulu
  if (adaPermintaanEnroll) {
    // >>> TAMBAHAN: paksa AS608 menyala untuk enroll, tidak tergantung
    // HC-SR04, karena web bisa minta enroll kapan saja.
    if (!as608Bertenaga) nyalakanAS608();
    while (!as608SudahSiap) {
      // Tunggu boot delay tanpa kelolaDayaAS608danIndikator()
      // agar HC-SR04 tidak mematikan relay AS608 saat proses ini
      if (millis() - waktuAS608Dinyalakan >= BOOT_DELAY_AS608_MS) {
        as608SudahSiap = true;
      }
      delay(10);
    }

    prosesEnroll();
    adaPermintaanEnroll = false;
  } else if (adaPermintaanHapusSemua) {
    // >>> Paksa AS608 menyala untuk hapus semua template
    if (!as608Bertenaga) nyalakanAS608();
    while (!as608SudahSiap) {
      if (millis() - waktuAS608Dinyalakan >= BOOT_DELAY_AS608_MS) {
        as608SudahSiap = true;
      }
      delay(10);
    }
    prosesHapusSemua();
    adaPermintaanHapusSemua = false;
  } else if (adaPermintaanHapus) {
    // >>> TAMBAHAN: paksa AS608 menyala untuk hapus template, tidak
    // tergantung HC-SR04, karena web bisa minta hapus kapan saja.
    if (!as608Bertenaga) nyalakanAS608();
    while (!as608SudahSiap) {
      // Tunggu boot delay tanpa kelolaDayaAS608danIndikator()
      // agar HC-SR04 tidak mematikan relay AS608 saat proses ini
      if (millis() - waktuAS608Dinyalakan >= BOOT_DELAY_AS608_MS) {
        as608SudahSiap = true;
      }
      delay(10);
    }
    prosesHapusTemplate(deleteFingerprintIdAntrian);
    adaPermintaanHapus = false;
    deleteFingerprintIdAntrian = -1;
  } else {
    // >>> TAMBAHAN: guard supaya absen cuma dicek saat AS608 sudah
    // bertenaga & sudah lewat boot delay (mencegah baca sensor mati).
    if (as608Bertenaga && as608SudahSiap) {
      cekAbsenOtomatis();
    }
  }

  delay(50);
}

// =========================================================
// MQTT: KONEKSI & CALLBACK
// =========================================================
void connectWiFi() {
  tampilkanLCD("Menghubungkan", "ke WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 30) {
    delay(500);
    attempt++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi terhubung. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    tampilkanLCD("WiFi gagal", "Cek jaringan");
  }
}

void connectMQTT() {
  int attempt = 0;
  while (!mqttClient.connected() && attempt < 5) {
    String clientId = "esp32-absensi-" + String(random(0xffff), HEX);
    Serial.print("Menghubungkan MQTT...");
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" berhasil!");
      mqttClient.subscribe(TOPIC_ENROLL_REQUEST);
      Serial.print("Subscribe ke: ");
      Serial.println(TOPIC_ENROLL_REQUEST);
      mqttClient.subscribe(TOPIC_DELETE_REQUEST);
      Serial.print("Subscribe ke: ");
      Serial.println(TOPIC_DELETE_REQUEST);
    } else {
      Serial.print(" gagal, rc=");
      Serial.println(mqttClient.state());
      delay(2000);
      attempt++;
    }
  }
}

// Dipanggil otomatis saat ada pesan masuk dari topic yang di-subscribe
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String pesan;
  for (unsigned int i = 0; i < length; i++) {
    pesan += (char)payload[i];
  }
  Serial.print("Pesan MQTT masuk [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(pesan);

  if (String(topic) == TOPIC_ENROLL_REQUEST) {
    DynamicJsonDocument doc(512);
    DeserializationError err = deserializeJson(doc, pesan);
    if (err) {
      Serial.println("Gagal parsing JSON enroll_request.");
      return;
    }

    enrollDocIdAktif = doc["docId"].as<String>();
    enrollNamaAktif = doc["name"].as<String>();
    adaPermintaanEnroll = true;
  } else if (String(topic) == TOPIC_DELETE_REQUEST) {
    DynamicJsonDocument doc(256);
    DeserializationError err = deserializeJson(doc, pesan);
    if (err) {
      Serial.println("Gagal parsing JSON delete_request.");
      return;
    }

    // Cek apakah perintah "Hapus Semua" atau hapus 1 per 1
    String fingerIdStr = doc["fingerprintId"].as<String>();
    if (fingerIdStr == "ALL") {
      adaPermintaanHapusSemua = true;
      Serial.println("Permintaan HAPUS SEMUA diterima!");
    } else {
      deleteFingerprintIdAntrian = fingerIdStr.toInt();
      adaPermintaanHapus = true;
      Serial.print("Permintaan hapus diterima: ID #");
      Serial.println(deleteFingerprintIdAntrian);
    }
  }
}

// =========================================================
// PROSES HAPUS SEMUA TEMPLATE (reset sensor AS608)
// =========================================================
void prosesHapusSemua() {
  Serial.println("Menghapus SEMUA template dari sensor AS608...");
  tampilkanLCD("RESET SENSOR", "Menghapus...");

  int p = finger.emptyDatabase();

  DynamicJsonDocument doc(256);
  doc["fingerprintId"] = "ALL";

  String payload;

  if (p == FINGERPRINT_OK) {
    // Reset cache lokal
    for (int id = 1; id <= MAX_ID; id++) {
      slotTerpakai[id] = false;
      namaUser[id] = "";
    }

    doc["success"] = true;
    serializeJson(doc, payload);
    mqttClient.publish(TOPIC_DELETE_RESULT, payload.c_str());
    Serial.println("SEMUA template berhasil dihapus dari sensor!");
    tampilkanLCD("Reset Berhasil", "Sensor Kosong");
  } else {
    doc["success"] = false;
    doc["error"] = "Gagal menghapus database sensor";
    serializeJson(doc, payload);
    mqttClient.publish(TOPIC_DELETE_RESULT, payload.c_str());
    Serial.println("GAGAL menghapus database sensor!");
    tampilkanLCD("Reset Gagal", "Coba lagi");
  }

  delay(2000);
  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

// =========================================================
// PROSES HAPUS TEMPLATE (dipanggil dari loop)
// =========================================================
void prosesHapusTemplate(int fingerprintId) {
  Serial.print("Menghapus template ID #");
  Serial.println(fingerprintId);
  tampilkanLCD("Menghapus...", "ID #" + String(fingerprintId));

  int p = finger.deleteModel(fingerprintId);

  DynamicJsonDocument doc(256);
  doc["fingerprintId"] = fingerprintId;

  String payload;

  if (p == FINGERPRINT_OK) {
    slotTerpakai[fingerprintId] = false;
    namaUser[fingerprintId] = "";
    doc["success"] = true;
    serializeJson(doc, payload);
    mqttClient.publish(TOPIC_DELETE_RESULT, payload.c_str());
    Serial.println("Hapus template berhasil.");
    tampilkanLCD("Hapus Berhasil", "ID #" + String(fingerprintId));
  } else {
    doc["success"] = false;
    doc["error"] = "ID tidak ditemukan di sensor";
    serializeJson(doc, payload);
    mqttClient.publish(TOPIC_DELETE_RESULT, payload.c_str());
    Serial.println("Hapus template gagal — ID tidak ditemukan.");
    tampilkanLCD("Hapus Gagal", "ID tidak ada");
  }

  delay(2000);
  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

// =========================================================
// PROSES ENROLL (dipanggil dari loop saat ada permintaan)
// =========================================================
void prosesEnroll() {
  // Guard: pastikan sinkronisasi slot sudah selesai sebelum proses enroll
  if (!sinkronisasiSelesai) {
    Serial.println("Enroll ditolak: sinkronisasi slot belum selesai.");
    tampilkanLCD("Enroll Ditolak", "Tunggu sync...");
    kirimHasilEnroll(false, -1);
    delay(2000);
    tampilkanLCD("Sistem Siap", "Tempel Jari");
    return;
  }

  tampilkanLCD("Daftar Baru:", enrollNamaAktif);
  delay(2000);

  int idKosong = cariIdKosongCepat();
  if (idKosong == -1) {
    tampilkanLCD("Gagal!", "Memori penuh");
    kirimHasilEnroll(false, -1);
    delay(2000);
    tampilkanLCD("Sistem Siap", "Tempel Jari");
    return;
  }

  Serial.print("ID kosong ditemukan: #");
  Serial.println(idKosong);

  int hasil = enrollFingerprint(idKosong);

  if (hasil == FINGERPRINT_OK) {
    slotTerpakai[idKosong] = true;
    namaUser[idKosong] = enrollNamaAktif;

    tampilkanLCD("Enroll Sukses!", "ID #" + String(idKosong));
    kirimHasilEnroll(true, idKosong);
  } else {
    tampilkanLCD("Enroll Gagal", "Coba lagi di web");
    kirimHasilEnroll(false, -1);
  }

  delay(2500);
  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

// Cari ID kosong dari cache lokal (cepat, tidak perlu tanya sensor)
int cariIdKosongCepat() {
  for (int id = 1; id <= MAX_ID; id++) {
    if (!slotTerpakai[id]) return id;
  }
  return -1;
}

int enrollFingerprint(int id) {
  int p = -1;

  tampilkanLCD("Tempel Jari", "Percobaan 1");
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    if (p != FINGERPRINT_OK && p != FINGERPRINT_NOFINGER) return p;
  }

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) return p;

  tampilkanLCD("Angkat Jari", "Sebentar...");
  delay(2000);
  p = 0;
  while (p != FINGERPRINT_NOFINGER) p = finger.getImage();

  tampilkanLCD("Tempel Lagi", "Percobaan 2");
  p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    if (p != FINGERPRINT_OK && p != FINGERPRINT_NOFINGER) return p;
  }

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) return p;

  p = finger.createModel();
  if (p != FINGERPRINT_OK) return p;

  p = finger.storeModel(id);
  
  // Tunggu sampai jari benar-benar diangkat supaya tidak langsung memicu absen otomatis
  tampilkanLCD("Angkat Jari", "Selesai Enroll");
  int checkFinger = 0;
  while (checkFinger != FINGERPRINT_NOFINGER) {
    checkFinger = finger.getImage();
    delay(50);
  }
  
  return p;
}

void kirimHasilEnroll(bool success, int fingerprintId) {
  DynamicJsonDocument doc(256);
  doc["docId"] = enrollDocIdAktif;
  doc["success"] = success;
  if (success) doc["fingerprintId"] = fingerprintId;

  String payload;
  serializeJson(doc, payload);

  mqttClient.publish(TOPIC_ENROLL_RESULT, payload.c_str());
  Serial.print("Hasil enroll dikirim: ");
  Serial.println(payload);

  enrollDocIdAktif = "";
  enrollNamaAktif = "";
}

// =========================================================
// PROSES ABSEN OTOMATIS (dicek terus tiap loop)
// =========================================================
void cekAbsenOtomatis() {
  int p = finger.getImage();
  if (p != FINGERPRINT_OK) return; // tidak ada jari, lanjut loop seperti biasa

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return;

  p = finger.fingerFastSearch();
  if (p != FINGERPRINT_OK) {
    tampilkanLCD("Tidak Dikenali", "Coba lagi");
    tandaGagalFingerprint(); // >>> TAMBAHAN: LED3 + buzzer 3x, sinkron & sama-sama mati
    delay(1500);
    tampilkanLCD("Sistem Siap", "Tempel Jari");
    return;
  }

  int idDitemukan = finger.fingerID;
  Serial.print("Absen: ID cocok #");
  Serial.println(idDitemukan);

  String nama = namaUser[idDitemukan];
  if (nama.length() == 0) nama = "Peserta #" + String(idDitemukan);

  tampilkanLCD("Selamat Datang,", nama);
  tandaSuksesFingerprint(); // >>> TAMBAHAN: LED2 + buzzer 1x, sinkron & sama-sama mati

  // Kirim ke topic scan (sama seperti sistem sebelumnya)
  String payload = "{\"fingerprintId\":" + String(idDitemukan) + ",\"status\":\"pending\"}";
  mqttClient.publish(TOPIC_SCAN, payload.c_str());

  delay(3000);
  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

// =========================================================
// BANTUAN
// =========================================================
void tampilkanLCD(String baris1, String baris2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(baris1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(baris2.substring(0, 16));
}
