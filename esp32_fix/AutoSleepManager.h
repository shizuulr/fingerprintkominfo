#ifndef AUTO_SLEEP_MANAGER_H
#define AUTO_SLEEP_MANAGER_H

#include <Arduino.h>
#include <time.h>

// Typedef untuk fungsi callback (fungsi yang akan dieksekusi sebelum ESP32 tertidur)
typedef void (*SleepCallback)();

class AutoSleepManager {
private:
    const char* ntpServer = "pool.ntp.org";
    const long  gmtOffset_sec = 7 * 3600; // Offset WIB (UTC+7) dalam detik
    const int   daylightOffset_sec = 0;
    SleepCallback onSleepCallback = nullptr;

public:
    // Fungsi inisialisasi
    void begin(SleepCallback callback) {
        onSleepCallback = callback;
        configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
        Serial.println("AutoSleepManager: Sinkronisasi waktu NTP (WIB) dimulai...");
    }

    // Fungsi pengecekan yang dipanggil di dalam loop()
    void loop() {
        struct tm timeinfo;
        
        // Jika belum berhasil mengambil waktu dari internet, abaikan
        if (!getLocalTime(&timeinfo)) {
            return;
        }

        int jam   = timeinfo.tm_hour;
        int menit = timeinfo.tm_min;
        int detik = timeinfo.tm_sec;

        // Rentang Sleep: Jam 18:00:00 sore s.d Jam 06:59:59 pagi
        if (jam >= 18 || jam < 7) {
            Serial.println("\n--- MEMASUKI JADWAL SLEEP NIGHT MODE (18:00 - 07:00) ---");

            // Hitung sisa detik secara DINAMIS sampai Jam 07:00:00 Pagi
            long detikKeJam7 = 0;
            if (jam >= 18) {
                // Sisa detik hari ini + 7 jam besok
                long sisaDetikHariIni = (24 * 3600) - (jam * 3600 + menit * 60 + detik);
                detikKeJam7 = sisaDetikHariIni + (7 * 3600);
            } else { 
                // Jika nyala di antara jam 00:00 - 06:59 pagi
                detikKeJam7 = (7 * 3600) - (jam * 3600 + menit * 60 + detik);
            }

            // Panggil fungsi callback untuk mematikan hardware fisik di kode utama
            if (onSleepCallback != nullptr) {
                onSleepCallback();
            }

            Serial.printf("ESP32 Deep Sleep selama %ld detik (~%.2f jam)...\n", detikKeJam7, detikKeJam7 / 3600.0);
            Serial.flush(); // Pastikan data serial terkirim sebelum mati

            // Konfigurasi RTC Timer & Aktifkan Deep Sleep
            uint64_t sleepMicroseconds = (uint64_t)detikKeJam7 * 1000000ULL;
            esp_sleep_enable_timer_wakeup(sleepMicroseconds);
            esp_deep_sleep_start(); // CPU & WiFi mati total di titik ini
        }
    }
};

// Buat satu instance objek secara global
AutoSleepManager sleepManager;

#endif