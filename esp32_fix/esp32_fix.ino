/*
  =====================================================================
  ABSENSI PKL - VERSI HARDWARE FISIK (ESP32 + AS608 + MQTT)
  + OPTIMASI: Histeresis HC-SR04 (Nyala Delay 3s, Mati Delay 10s)
  + OPTIMASI: Indikator Non-blocking pada Enroll (LED & Buzzer)
  + FITUR BARU: Auto Deep Sleep WIB (Modular via File Header)
  + FITUR BARU: Penyimpanan Nama Permanen via NVS (Preferences)
  + FITUR UPGRADE: Tombol Reset Responsif Setiap Saat
  + BUG FIX: Kunci Daya Relay (Relay pantang mati selama proses Enroll)
  + BUG FIX: setup()/loop() digabung (sebelumnya terduplikasi -> compile error)
  + BUG FIX: WIFI_SSID/WIFI_PASS diganti currentSsid/currentPass (NVS)
  + BUG FIX: handleSaveWifi sekarang bisa terima form-urlencoded MAUPUN JSON body
  + FITUR BARU: mDNS (http://absensi-pkl.local) supaya IP tidak perlu dihafal
  + FITUR BARU: Halaman konfigurasi WiFi bawaan ESP32 di "/" (hindari mixed-content HTTPS->HTTP)
  =====================================================================
*/

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_Fingerprint.h>
#include <Preferences.h>

// >>> PANGGIL FILE HEADER AUTO SLEEP DI SINI <<<
#include "AutoSleepManager.h"

// ---------- LCD ----------
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---------- SENSOR FINGERPRINT ----------
HardwareSerial fingerSerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&fingerSerial);

// ---------- MEMORI PERMANEN (NVS) ----------
Preferences preferences;

// ---------- WIFI ----------
WebServer server(80);
const char* DEFAULT_WIFI_SSID = "STATISTIK";
const char* DEFAULT_WIFI_PASS = "st4t1st1k";
String currentSsid = "";
String currentPass = "";

// ---------- MQTT ----------
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT = 1883;
const char* TOPIC_ENROLL_REQUEST = "absensipkl_temanggung_2026/enroll_request";
const char* TOPIC_ENROLL_RESULT  = "absensipkl_temanggung_2026/enroll_result";
const char* TOPIC_SCAN           = "absensipkl_temanggung_2026/scan";
const char* TOPIC_DELETE_REQUEST = "absensipkl_temanggung_2026/delete_request";
const char* TOPIC_DELETE_RESULT  = "absensipkl_temanggung_2026/delete_result";
const char* TOPIC_RESET_REQUEST  = "absensipkl_temanggung_2026/reset_request";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ---------- CACHE LOKAL ----------
const int MAX_ID = 200;
bool slotTerpakai[MAX_ID + 1] = { false };
char namaUser[MAX_ID + 1][32];
bool sinkronisasiSelesai = false;

volatile bool adaPermintaanEnroll = false;
volatile bool adaPermintaanHapus = false;
volatile bool adaPermintaanHapusSemua = false;
String enrollDocIdAktif = "";
String enrollNamaAktif = "";
int deleteFingerprintIdAntrian = -1;

// ---------- PIN & KONFIGURASI ----------
#define TRIG_PIN   32
#define ECHO_PIN   35
#define RELAY_AS608_PIN  25
const bool RELAY_AKTIF_LOW = true;
#define BUZZER_PIN 26
const bool BUZZER_AKTIF_LOW = false;
#define LED_MAINTENANCE  27
#define LED_SUKSES       14
#define LED_GAGAL        12
#define RESET_BUTTON_PIN 4

// Timer Histeresis Sensor Jarak
const float JARAK_ON_CM  = 10.0;
const float JARAK_OFF_CM = 30.0;
const unsigned long INTERVAL_BACA_JARAK_MS = 100;
const unsigned long TIMEOUT_NYALA_MS = 250;
const unsigned long TIMEOUT_MATI_MS  = 10000;
const unsigned long BOOT_DELAY_AS608_MS    = 600;
const unsigned long INTERVAL_BLINK_LED1_MS = 700;

// State Histeresis & Daya
unsigned long waktuBacaJarakTerakhir = 0;
unsigned long waktuTanganMulaiTerdeteksi = 0;
unsigned long waktuTanganMulaiHilang = 0;
bool statusTanganDiArea = false;

// >>> FIX ENROLL: Bendera untuk mengunci relay agar tidak mati saat proses krusial
bool tahanDayaSensor = false;

unsigned long waktuBlinkLED1Terakhir = 0;
bool statusLED1 = false;
bool as608Bertenaga = false;
unsigned long waktuAS608Dinyalakan = 0;
bool as608SudahSiap = false;

// State Indikator
unsigned long waktuIndikatorMulai = 0;
bool indikatorAktif = false;
int modeIndikator = 0;
int stepIndikator = 0;
unsigned long waktuTerakhirAbsen = 0;
const unsigned long COOLDOWN_ABSEN_MS = 3000;
bool tampilSistemSiap = true;

// FreeRTOS Task
TaskHandle_t TaskJaringan;
QueueHandle_t queuePublish;

typedef struct {
  char topic[80];
  char payload[200];
} MqttMsg;

void enqueueMqttPublish(const char* topic, const char* payload) {
  MqttMsg msg;
  strlcpy(msg.topic, topic, sizeof(msg.topic));
  strlcpy(msg.payload, payload, sizeof(msg.payload));
  xQueueSend(queuePublish, &msg, portMAX_DELAY);
}

// =========================================================
// HARDWARE & INDIKATOR UTILITY
// =========================================================
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

void setupTambahanHardware() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  pinMode(RELAY_AS608_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_MAINTENANCE, OUTPUT);
  pinMode(LED_SUKSES, OUTPUT);
  pinMode(LED_GAGAL, OUTPUT);
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);
  buzzerDiam();
  digitalWrite(LED_MAINTENANCE, LOW);
  digitalWrite(LED_SUKSES, LOW);
  digitalWrite(LED_GAGAL, LOW);

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
  long durasi = pulseIn(ECHO_PIN, HIGH, 15000);
  if (durasi == 0) return 999.0;
  return (durasi * 0.0343) / 2.0;
}

void buzzerBunyi() { digitalWrite(BUZZER_PIN, BUZZER_AKTIF_LOW ? LOW : HIGH); }
void buzzerDiam() { digitalWrite(BUZZER_PIN, BUZZER_AKTIF_LOW ? HIGH : LOW); }
void tampilkanLCD(String baris1, String baris2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(baris1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(baris2.substring(0, 16));
}

void cekTombolReset() {
  if (digitalRead(RESET_BUTTON_PIN) == LOW) {
    tampilkanLCD("Reset Manual", "Mohon tunggu...");
    buzzerBunyi();
    delay(1500);
    buzzerDiam();
    ESP.restart();
  }
}

// >>> CALLBACK UNTUK FILE HEADER AUTO SLEEP <<<
void rutinitasSebelumTidur() {
  lcd.clear();
  lcd.noBacklight();
  digitalWrite(LED_MAINTENANCE, LOW);
  digitalWrite(LED_SUKSES, LOW);
  digitalWrite(LED_GAGAL, LOW);
  buzzerDiam();
  matikanAS608();
}

// =========================================================
// WEBSERVER HANDLER (Konfigurasi WiFi dari React/HTTP)
// =========================================================

// Halaman bawaan ESP32 untuk ganti WiFi. Dibuka LANGSUNG lewat IP/ mDNS
// perangkat (http://<ip-esp32>/ atau http://absensi-pkl.local/), BUKAN
// dari dashboard React/Firebase yang berjalan di HTTPS -- karena browser
// akan memblokir fetch() dari halaman HTTPS ke perangkat HTTP (mixed content).
void handleRoot() {
  String html =
    "<!DOCTYPE html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<title>Konfigurasi WiFi Absensi PKL</title>"
    "<style>body{font-family:sans-serif;max-width:360px;margin:40px auto;padding:0 16px}"
    "input{width:100%;padding:8px;margin:6px 0;box-sizing:border-box}"
    "button{width:100%;padding:10px;background:#2563eb;color:#fff;border:0;border-radius:4px}</style>"
    "</head><body>"
    "<h3>Konfigurasi WiFi ESP32</h3>"
    "<p>SSID saat ini: <b>" + currentSsid + "</b></p>"
    "<form method='POST' action='/save'>"
    "<input name='ssid' placeholder='Nama WiFi (SSID)' required>"
    "<input name='pass' placeholder='Password WiFi' type='password'>"
    "<button type='submit'>Simpan & Restart</button>"
    "</form>"
    "</body></html>";
  server.send(200, "text/html", html);
}

void handleSaveWifi() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

  if (server.method() == HTTP_OPTIONS) {
    server.send(204);
    return;
  }

  String newSsid = "";
  String newPass = "";

  if (server.hasArg("ssid")) {
    // Dikirim sebagai form-urlencoded (form HTML biasa, atau fetch dengan
    // Content-Type: application/x-www-form-urlencoded / URLSearchParams)
    newSsid = server.arg("ssid");
    newPass = server.arg("pass");
  } else if (server.hasArg("plain")) {
    // Dikirim sebagai JSON mentah, misal fetch(...,{body: JSON.stringify({ssid,pass})})
    String body = server.arg("plain");
    Serial.println("Body diterima /save: " + body);
    DynamicJsonDocument doc(256);
    DeserializationError err = deserializeJson(doc, body);
    if (!err) {
      newSsid = doc["ssid"] | "";
      newPass = doc["pass"] | "";
    }
  }

  Serial.println("Percobaan simpan WiFi -> ssid: '" + newSsid + "'");

  if (newSsid.length() > 0) {
    preferences.begin("wifi_cfg", false);
    preferences.putString("ssid", newSsid);
    preferences.putString("pass", newPass);
    preferences.end();

    server.send(200, "text/plain", "OK, merestart...");
    delay(1000);
    ESP.restart();
  } else {
    Serial.println("Gagal: field ssid kosong / tidak ditemukan di request.");
    server.send(400, "text/plain", "Bad Request: field 'ssid' tidak ditemukan (cek format body request)");
  }
}

// =========================================================
// SETUP
// =========================================================
void setup() {
  Serial.begin(115200);
  delay(100);

  // 1. Baca kredensial WiFi dari NVS (fallback ke default bila belum pernah diset)
  preferences.begin("wifi_cfg", true);
  currentSsid = preferences.getString("ssid", DEFAULT_WIFI_SSID);
  currentPass = preferences.getString("pass", DEFAULT_WIFI_PASS);
  preferences.end();

  // 2. LCD & hardware tambahan
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  tampilkanLCD("Absensi PKL", "Inisialisasi...");

  setupTambahanHardware();

  for (int i = 0; i <= MAX_ID; i++) { namaUser[i][0] = '\0'; }

  // 3. Sensor fingerprint
  fingerSerial.begin(57600, SERIAL_8N1, 16, 17);
  delay(1000);
  if (!finger.verifyPassword()) {
    tampilkanLCD("Sensor Error", "Cek wiring!");
    while (1) { delay(1000); }
  }

  finger.getTemplateCount();
  sinkronisasiSlotDariSensor();

  // 4. Koneksi WiFi
  tampilkanLCD("Menghubungkan", "ke WiFi...");
  WiFi.begin(currentSsid.c_str(), currentPass.c_str());
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 30) {
    delay(500);
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    tampilkanLCD("WiFi Terhubung", WiFi.localIP().toString());
    delay(1000);
  } else {
    tampilkanLCD("WiFi Gagal", "Cek via Serial");
    delay(1000);
  }

  // 5. Webserver untuk ganti kredensial WiFi
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSaveWifi);
  server.on("/save", HTTP_OPTIONS, handleSaveWifi);
  server.begin();

  // mDNS supaya perangkat bisa diakses via http://absensi-pkl.local/
  // tanpa perlu tahu IP-nya (berguna kalau IP DHCP berubah-ubah)
  if (WiFi.status() == WL_CONNECTED) {
    if (MDNS.begin("absensi-pkl")) {
      Serial.println("mDNS aktif: http://absensi-pkl.local/");
    }
  }

  // 6. Auto sleep manager
  sleepManager.begin(rutinitasSebelumTidur);

  // 7. FreeRTOS: task jaringan (MQTT) di core 0
  queuePublish = xQueueCreate(10, sizeof(MqttMsg));
  xTaskCreatePinnedToCore(taskJaringanLoop, "TaskJaringan", 8192, NULL, 1, &TaskJaringan, 0);

  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

// =========================================================
// LOOP UTAMA (CORE 1)
// =========================================================
void loop() {
  cekTombolReset();
  server.handleClient();

  // Konfigurasi WiFi darurat lewat USB Serial, format: ssid,pass
  if (Serial.available()) {
    String data = Serial.readStringUntil('\n');
    data.trim();
    int commaIndex = data.indexOf(',');
    if (commaIndex > 0) {
      String newSsid = data.substring(0, commaIndex);
      String newPass = data.substring(commaIndex + 1);

      preferences.begin("wifi_cfg", false);
      preferences.putString("ssid", newSsid);
      preferences.putString("pass", newPass);
      preferences.end();

      Serial.println("Konfigurasi WiFi disimpan lewat USB!");
      delay(500);
      ESP.restart();
    }
  }

  static unsigned long lastCekWaktu = 0;
  if (millis() - lastCekWaktu >= 10000) {
    lastCekWaktu = millis();
    sleepManager.loop();
  }

  kelolaDayaAS608danIndikator();
  updateIndikatorNonBlocking();

  if (!tampilSistemSiap && !indikatorAktif && (millis() - waktuTerakhirAbsen >= COOLDOWN_ABSEN_MS)) {
    tampilkanLCD("Sistem Siap", "Tempel Jari");
    tampilSistemSiap = true;
  }

  if (adaPermintaanEnroll) {
    tahanDayaSensor = true; // >>> FIX ENROLL: KUNCI RELAY AGAR TETAP MENYALA

    if (!as608Bertenaga) nyalakanAS608();
    while (!as608SudahSiap) {
      if (millis() - waktuAS608Dinyalakan >= BOOT_DELAY_AS608_MS) as608SudahSiap = true;
      delay(10);
    }

    prosesEnroll();

    tahanDayaSensor = false; // >>> FIX ENROLL: LEPAS KUNCI
    waktuTanganMulaiHilang = millis();
    adaPermintaanEnroll = false;
  }
  else if (adaPermintaanHapusSemua) {
    tahanDayaSensor = true;
    if (!as608Bertenaga) nyalakanAS608();
    while (!as608SudahSiap) {
      if (millis() - waktuAS608Dinyalakan >= BOOT_DELAY_AS608_MS) as608SudahSiap = true;
      delay(10);
    }

    prosesHapusSemua();

    tahanDayaSensor = false;
    waktuTanganMulaiHilang = millis();
    adaPermintaanHapusSemua = false;
  }
  else if (adaPermintaanHapus) {
    tahanDayaSensor = true;
    if (!as608Bertenaga) nyalakanAS608();
    while (!as608SudahSiap) {
      if (millis() - waktuAS608Dinyalakan >= BOOT_DELAY_AS608_MS) as608SudahSiap = true;
      delay(10);
    }

    prosesHapusTemplate(deleteFingerprintIdAntrian);

    tahanDayaSensor = false;
    waktuTanganMulaiHilang = millis();
    adaPermintaanHapus = false;
    deleteFingerprintIdAntrian = -1;
  }
  else {
    if (as608Bertenaga && as608SudahSiap) {
      cekAbsenOtomatis();
    }
  }

  delay(20);
}

// =========================================================
// LOGIKA SENSOR, MEMORI PERMANEN & NETWORK
// =========================================================

void kelolaDayaAS608danIndikator() {
  if (millis() - waktuBacaJarakTerakhir >= INTERVAL_BACA_JARAK_MS) {
    waktuBacaJarakTerakhir = millis();
    float jarak = bacaJarakCM();

    if (jarak <= JARAK_ON_CM) {
      waktuTanganMulaiHilang = millis();
      if (!statusTanganDiArea) {
        statusTanganDiArea = true;
        waktuTanganMulaiTerdeteksi = millis();
      }
      if (!as608Bertenaga && (millis() - waktuTanganMulaiTerdeteksi >= TIMEOUT_NYALA_MS)) {
        nyalakanAS608();
      }
    }
    else if (jarak > JARAK_OFF_CM) {
      statusTanganDiArea = false;

      // >>> FIX ENROLL: Tambahkan syarat '!tahanDayaSensor' agar relay dilarang mati bila sedang enroll
      if (as608Bertenaga && !tahanDayaSensor && (millis() - waktuTanganMulaiHilang >= TIMEOUT_MATI_MS)) {
        matikanAS608();
      }
    }
    else {
      statusTanganDiArea = false;
      waktuTanganMulaiHilang = millis();
    }
  }

  if (as608Bertenaga && !as608SudahSiap) {
    if (millis() - waktuAS608Dinyalakan >= BOOT_DELAY_AS608_MS) as608SudahSiap = true;
  }

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

void tandaSuksesFingerprint() {
  digitalWrite(LED_GAGAL, LOW);
  digitalWrite(LED_SUKSES, HIGH);
  buzzerBunyi();
  waktuIndikatorMulai = millis();
  indikatorAktif = true;
  modeIndikator = 1;
}

void tandaGagalFingerprint() {
  digitalWrite(LED_SUKSES, LOW);
  digitalWrite(LED_GAGAL, HIGH);
  buzzerBunyi();
  waktuIndikatorMulai = millis();
  indikatorAktif = true;
  modeIndikator = 2;
  stepIndikator = 0;
}

void updateIndikatorNonBlocking() {
  if (!indikatorAktif) return;
  if (modeIndikator == 1) {
    if (millis() - waktuIndikatorMulai >= 1000) {
      digitalWrite(LED_SUKSES, LOW);
      buzzerDiam();
      indikatorAktif = false;
      modeIndikator = 0;
    }
  } else if (modeIndikator == 2) {
    unsigned long elapsed = millis() - waktuIndikatorMulai;
    if (elapsed >= 3000) {
      digitalWrite(LED_GAGAL, LOW);
      buzzerDiam();
      indikatorAktif = false;
      modeIndikator = 0;
    } else {
      int currentStep = elapsed / 500;
      if (currentStep != stepIndikator) {
        stepIndikator = currentStep;
        if (stepIndikator % 2 == 0) {
          digitalWrite(LED_GAGAL, HIGH);
          buzzerBunyi();
        } else {
          digitalWrite(LED_GAGAL, LOW);
          buzzerDiam();
        }
      }
    }
  }
}

void tungguSambilUpdateIndikator(unsigned long durasi) {
  unsigned long awal = millis();
  while (millis() - awal < durasi) {
    cekTombolReset();
    kelolaDayaAS608danIndikator();
    updateIndikatorNonBlocking();
    delay(20);
  }
}

void sinkronisasiSlotDariSensor() {
  tampilkanLCD("Sinkronisasi...", "Mohon tunggu");
  preferences.begin("absen_data", true);

  for (int id = 1; id <= MAX_ID; id++) {
    if (finger.loadModel(id) == FINGERPRINT_OK) {
      slotTerpakai[id] = true;
      String key = "n_" + String(id);
      String namaTersimpan = preferences.getString(key.c_str(), "");
      if (namaTersimpan.length() > 0) {
        strlcpy(namaUser[id], namaTersimpan.c_str(), sizeof(namaUser[id]));
      }
    }
  }
  preferences.end();
  sinkronisasiSelesai = true;
}

void cekAbsenOtomatis() {
  if (indikatorAktif || (millis() - waktuTerakhirAbsen < COOLDOWN_ABSEN_MS)) return;
  int p = finger.getImage();
  if (p != FINGERPRINT_OK) return;
  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return;

  p = finger.fingerFastSearch();
  if (p != FINGERPRINT_OK) {
    tampilkanLCD("Tidak Dikenali", "Coba lagi");
    tandaGagalFingerprint();
    waktuTerakhirAbsen = millis();
    tampilSistemSiap = false;
    return;
  }

  int idDitemukan = finger.fingerID;
  String nama = String(namaUser[idDitemukan]);
  if (nama.length() == 0) nama = "Peserta #" + String(idDitemukan);

  tampilkanLCD("Selamat Datang,", nama);
  tandaSuksesFingerprint();

  String payload = "{\"fingerprintId\":" + String(idDitemukan) + ",\"status\":\"pending\"}";
  enqueueMqttPublish(TOPIC_SCAN, payload.c_str());

  waktuTerakhirAbsen = millis();
  tampilSistemSiap = false;
}

void prosesHapusSemua() {
  tampilkanLCD("RESET SENSOR", "Menghapus...");
  int p = finger.emptyDatabase();
  DynamicJsonDocument doc(256);
  doc["fingerprintId"] = "ALL";
  String payload;

  if (p == FINGERPRINT_OK) {
    preferences.begin("absen_data", false);
    preferences.clear();
    preferences.end();

    for (int id = 1; id <= MAX_ID; id++) { slotTerpakai[id] = false; namaUser[id][0] = '\0'; }
    doc["success"] = true; serializeJson(doc, payload);
    enqueueMqttPublish(TOPIC_DELETE_RESULT, payload.c_str());
    tampilkanLCD("Reset Berhasil", "Sensor Kosong");
    tandaSuksesFingerprint();
  } else {
    doc["success"] = false; doc["error"] = "Gagal"; serializeJson(doc, payload);
    enqueueMqttPublish(TOPIC_DELETE_RESULT, payload.c_str());
    tampilkanLCD("Reset Gagal", "Coba lagi");
    tandaGagalFingerprint();
  }
  tungguSambilUpdateIndikator(3000);
  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

void prosesHapusTemplate(int fingerprintId) {
  tampilkanLCD("Menghapus...", "ID #" + String(fingerprintId));
  int p = finger.deleteModel(fingerprintId);
  DynamicJsonDocument doc(256);
  doc["fingerprintId"] = fingerprintId;
  String payload;

  if (p == FINGERPRINT_OK) {
    slotTerpakai[fingerprintId] = false; namaUser[fingerprintId][0] = '\0';

    preferences.begin("absen_data", false);
    String key = "n_" + String(fingerprintId);
    preferences.remove(key.c_str());
    preferences.end();

    doc["success"] = true; serializeJson(doc, payload);
    enqueueMqttPublish(TOPIC_DELETE_RESULT, payload.c_str());
    tampilkanLCD("Hapus Berhasil", "ID #" + String(fingerprintId));
    tandaSuksesFingerprint();
  } else {
    doc["success"] = false; doc["error"] = "Gagal"; serializeJson(doc, payload);
    enqueueMqttPublish(TOPIC_DELETE_RESULT, payload.c_str());
    tampilkanLCD("Hapus Gagal", "ID tidak ada");
    tandaGagalFingerprint();
  }
  tungguSambilUpdateIndikator(3000);
  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

void prosesEnroll() {
  if (!sinkronisasiSelesai) {
    tampilkanLCD("Enroll Ditolak", "Tunggu sync...");
    tandaGagalFingerprint();
    kirimHasilEnroll(false, -1);
    tungguSambilUpdateIndikator(3000);
    tampilkanLCD("Sistem Siap", "Tempel Jari");
    return;
  }
  tampilkanLCD("Daftar Baru:", enrollNamaAktif);
  tungguSambilUpdateIndikator(2000);

  int idKosong = cariIdKosongCepat();
  if (idKosong == -1) {
    tampilkanLCD("Gagal!", "Memori penuh");
    tandaGagalFingerprint();
    kirimHasilEnroll(false, -1);
    tungguSambilUpdateIndikator(3000);
    tampilkanLCD("Sistem Siap", "Tempel Jari");
    return;
  }

  int hasil = enrollFingerprint(idKosong);
  if (hasil == FINGERPRINT_OK) {
    slotTerpakai[idKosong] = true;
    strlcpy(namaUser[idKosong], enrollNamaAktif.c_str(), sizeof(namaUser[idKosong]));

    preferences.begin("absen_data", false);
    String key = "n_" + String(idKosong);
    preferences.putString(key.c_str(), enrollNamaAktif);
    preferences.end();

    tampilkanLCD("Enroll Sukses!", "ID #" + String(idKosong));
    tandaSuksesFingerprint();
    kirimHasilEnroll(true, idKosong);
  } else {
    tampilkanLCD("Enroll Gagal", "Coba lagi di web");
    tandaGagalFingerprint();
    kirimHasilEnroll(false, -1);
  }

  tungguSambilUpdateIndikator(3000);
  tampilkanLCD("Sistem Siap", "Tempel Jari");
}

int cariIdKosongCepat() {
  for (int id = 1; id <= MAX_ID; id++) { if (!slotTerpakai[id]) return id; }
  return -1;
}

int enrollFingerprint(int id) {
  int p = -1; tampilkanLCD("Tempel Jari", "Percobaan 1");
  while (p != FINGERPRINT_OK) { p = finger.getImage(); if (p != FINGERPRINT_OK && p != FINGERPRINT_NOFINGER) return p; cekTombolReset(); }
  p = finger.image2Tz(1); if (p != FINGERPRINT_OK) return p;

  tampilkanLCD("Angkat Jari", "Sebentar...");
  tungguSambilUpdateIndikator(2000);
  p = 0; while (p != FINGERPRINT_NOFINGER) { p = finger.getImage(); cekTombolReset(); }

  tampilkanLCD("Tempel Lagi", "Percobaan 2"); p = -1;
  while (p != FINGERPRINT_OK) { p = finger.getImage(); if (p != FINGERPRINT_OK && p != FINGERPRINT_NOFINGER) return p; cekTombolReset(); }
  p = finger.image2Tz(2); if (p != FINGERPRINT_OK) return p;
  p = finger.createModel(); if (p != FINGERPRINT_OK) return p;
  p = finger.storeModel(id);

  tampilkanLCD("Angkat Jari", "Selesai Enroll");
  int checkFinger = 0; while (checkFinger != FINGERPRINT_NOFINGER) { checkFinger = finger.getImage(); delay(50); }
  return p;
}

void kirimHasilEnroll(bool success, int fingerprintId) {
  DynamicJsonDocument doc(256);
  doc["docId"] = enrollDocIdAktif; doc["success"] = success;
  if (success) doc["fingerprintId"] = fingerprintId;
  String payload; serializeJson(doc, payload);
  enqueueMqttPublish(TOPIC_ENROLL_RESULT, payload.c_str());
  enrollDocIdAktif = ""; enrollNamaAktif = "";
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String pesan; for (unsigned int i = 0; i < length; i++) pesan += (char)payload[i];
  if (String(topic) == TOPIC_ENROLL_REQUEST) {
    DynamicJsonDocument doc(512);
    if (!deserializeJson(doc, pesan)) {
      enrollDocIdAktif = doc["docId"].as<String>(); enrollNamaAktif = doc["name"].as<String>(); adaPermintaanEnroll = true;
    }
  } else if (String(topic) == TOPIC_DELETE_REQUEST) {
    DynamicJsonDocument doc(256);
    if (!deserializeJson(doc, pesan)) {
      String fingerIdStr = doc["fingerprintId"].as<String>();
      if (fingerIdStr == "ALL") adaPermintaanHapusSemua = true;
      else { deleteFingerprintIdAntrian = fingerIdStr.toInt(); adaPermintaanHapus = true; }
    }
  } else if (String(topic) == TOPIC_RESET_REQUEST) {
    tampilkanLCD("Reset dari Web", "Memuat ulang...");
    buzzerBunyi();
    delay(1500);
    buzzerDiam();
    ESP.restart();
  }
}

void taskJaringanLoop(void * pvParameters) {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  for(;;) {
    if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); vTaskDelay(5000 / portTICK_PERIOD_MS); }
    else {
      if (!mqttClient.connected()) {
        String clientId = "esp32-absensi-" + String(random(0xffff), HEX);
        if (mqttClient.connect(clientId.c_str())) {
          mqttClient.subscribe(TOPIC_ENROLL_REQUEST); mqttClient.subscribe(TOPIC_DELETE_REQUEST); mqttClient.subscribe(TOPIC_RESET_REQUEST);
        } else { vTaskDelay(3000 / portTICK_PERIOD_MS); }
      } else {
        mqttClient.loop();
        MqttMsg msg; if (xQueueReceive(queuePublish, &msg, 0) == pdPASS) mqttClient.publish(msg.topic, msg.payload);
      }
    }
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}
