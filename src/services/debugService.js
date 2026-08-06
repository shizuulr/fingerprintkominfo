/**
 * ============================================================================
 * debugService.js — Modul Debug Sistem Absensi
 * ============================================================================
 * Menangani:
 * 1. Global Error Tracking (window.onerror + unhandledrejection)
 * 2. Fingerprint Status Tracking (dari MqttListener / ScanProcessor)
 * 3. Device Detection (Mobile vs PC)
 * 4. Dynamic Eruda Console Loader (lazy-load dari CDN)
 * 5. Snapshot Logger ke Firebase Firestore (koleksi system_debug_logs)
 * ============================================================================
 */

import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

// ─────────────────────────────────────────────────────────────────────────────
// 1. GLOBAL ERROR TRACKING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menyimpan error JavaScript terakhir yang tertangkap secara global.
 * Diupdate otomatis oleh window.onerror dan onunhandledrejection.
 */
let _lastError = null;

/**
 * Inisialisasi penangkap error global.
 * Dipanggil sekali saat aplikasi pertama kali dimount (di App.jsx).
 * Menangkap:
 *  - Unhandled errors (syntax error, runtime error, dll)
 *  - Unhandled promise rejections (fetch gagal, async error tanpa catch, dll)
 */
export function initGlobalErrorHandler() {
  // Tangkap error JavaScript biasa (synchronous)
  window.onerror = (message, source, lineno, colno, errorObj) => {
    _lastError = {
      type: 'onerror',
      message: String(message),
      source: source || 'unknown',
      line: lineno,
      column: colno,
      stack: errorObj?.stack || 'No stack trace',
      capturedAt: new Date().toISOString(),
    };
    console.warn('[DebugService] Error tertangkap:', _lastError.message);
  };

  // Tangkap promise rejection yang tidak di-catch
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason);
    const name = reason?.name || '';

    // Abaikan AbortError (misalnya dari request fetch yang dibatalkan atau Firebase idle timeout)
    // agar tidak memenuhi log debug.
    if (name === 'AbortError' || message.includes('user aborted a request') || message.includes('The user aborted a request')) {
      event.preventDefault(); // Mencegah browser mencetak error ini secara native ke console
      return;
    }

    _lastError = {
      type: 'unhandledrejection',
      message: message,
      stack: reason?.stack || 'No stack trace',
      capturedAt: new Date().toISOString(),
    };
    console.warn('[DebugService] Unhandled rejection:', _lastError.message);
  };

  console.log('[DebugService] Global error handler aktif.');
}

/** Mengambil error terakhir yang tertangkap. */
export function getLastError() {
  return _lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FINGERPRINT STATUS TRACKER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status koneksi/aktivitas alat fingerprint.
 * Diupdate oleh MqttListener.jsx saat:
 *  - MQTT connect        → 'CONNECTED'
 *  - MQTT disconnect/err → 'DISCONNECTED'
 *  - Menerima scan       → 'READING'
 *  - Scan error          → 'READING_ERROR'
 *  - Idle (default)      → 'IDLE'
 */
let _fingerprintStatus = 'IDLE';

export function setFingerprintStatus(status) {
  _fingerprintStatus = status;
}

export function getFingerprintStatus() {
  return _fingerprintStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DEVICE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deteksi apakah pengguna mengakses dari perangkat Mobile atau PC.
 * Menggunakan regex pada navigator.userAgent.
 * @returns {'Mobile' | 'PC'}
 */
export function getDeviceType() {
  const ua = navigator.userAgent || '';
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  return mobileRegex.test(ua) ? 'Mobile' : 'PC';
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ERUDA DYNAMIC LOADER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flag internal: apakah Eruda sudah dimuat ke halaman.
 * Mencegah pemuatan ganda script CDN.
 */
let _erudaLoaded = false;
let _erudaVisible = false;

/**
 * Memuat library Eruda secara dinamis dari CDN.
 * Eruda adalah in-app DevTools console untuk browser mobile.
 * Repo: https://github.com/liriliri/eruda
 *
 * Strategi:
 *  - Script hanya dimuat saat tombol Debug ditekan (lazy-load)
 *  - Setelah dimuat, eruda.init() dipanggil untuk menginisialisasi panel
 *  - Pemanggilan berikutnya hanya toggle show/hide
 *
 * @returns {Promise<void>}
 */
export async function toggleEruda() {
  // Jika belum pernah dimuat, inject script CDN ke halaman
  if (!_erudaLoaded) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/eruda';
      script.onload = () => {
        // eruda sudah tersedia sebagai global variable setelah script dimuat
        if (window.eruda) {
          window.eruda.init();
          _erudaLoaded = true;
          _erudaVisible = true;
          console.log('[DebugService] Eruda berhasil dimuat dan diinisialisasi.');
        }
        resolve();
      };
      script.onerror = (err) => {
        console.error('[DebugService] Gagal memuat Eruda dari CDN:', err);
        reject(new Error('Gagal memuat Eruda'));
      };
      document.head.appendChild(script);
    });
    return;
  }

  // Jika sudah dimuat, toggle visibility
  if (window.eruda) {
    if (_erudaVisible) {
      window.eruda.hide();
      _erudaVisible = false;
    } else {
      window.eruda.show();
      _erudaVisible = true;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FIREBASE SNAPSHOT LOGGER
// ─────────────────────────────────────────────────────────────────────────────

/** Nama koleksi Firestore untuk menyimpan log debug. */
const DEBUG_LOGS_COLLECTION = 'system_debug_logs';

/**
 * Mengumpulkan data snapshot sistem saat ini dan menyimpannya ke Firestore.
 * Dipanggil setiap kali tombol Debug ditekan.
 *
 * Data yang dikumpulkan:
 *  - timestamp       : Server timestamp Firebase (waktu server, bukan lokal)
 *  - deviceType      : 'Mobile' atau 'PC'
 *  - userAgent       : String lengkap browser + OS
 *  - onlineStatus    : 'Online' atau 'Offline' (navigator.onLine)
 *  - fingerprintStatus: Status terakhir alat fingerprint
 *  - lastError       : Detail error terakhir yang tertangkap (jika ada)
 *  - screenResolution: Resolusi layar (misal: '1920x1080')
 *  - mqttStatus      : Status koneksi MQTT broker
 *  - currentUrl      : URL halaman saat snapshot diambil
 *  - localTime       : Waktu lokal perangkat saat snapshot diambil
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function sendDebugSnapshot() {
  try {
    const snapshot = {
      timestamp: serverTimestamp(),
      deviceType: getDeviceType(),
      userAgent: navigator.userAgent,
      onlineStatus: navigator.onLine ? 'Online' : 'Offline',
      fingerprintStatus: getFingerprintStatus(),
      lastError: _lastError
        ? {
            type: _lastError.type,
            message: _lastError.message,
            stack: _lastError.stack,
            source: _lastError.source || null,
            line: _lastError.line || null,
            capturedAt: _lastError.capturedAt,
          }
        : null,
      screenResolution: `${screen.width}x${screen.height}`,
      mqttStatus: window.mqttClient?.connected ? 'CONNECTED' : 'DISCONNECTED',
      currentUrl: window.location.href,
      localTime: new Date().toISOString(),
    };

    await addDoc(collection(db, DEBUG_LOGS_COLLECTION), snapshot);

    console.log('[DebugService] Snapshot debug berhasil dikirim ke Firebase.');
    return { success: true, message: 'Laporan debug berhasil dikirim!' };
  } catch (error) {
    console.error('[DebugService] Gagal mengirim snapshot:', error);
    return { success: false, message: 'Gagal mengirim laporan: ' + error.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. DEBUG LOG VIEWER & ANALYZER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mengambil log terbaru dari Firestore
 * @param {number} limitCount - jumlah maksimum dokumen yang diambil
 */
export async function getDebugLogs(limitCount = 20) {
  try {
    const q = query(
      collection(db, DEBUG_LOGS_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('[DebugService] Gagal mengambil log:', error);
    throw error;
  }
}

/**
 * Menganalisis log snapshot untuk memberikan terjemahan bahasa manusia (bahasa Indonesia)
 * tentang apa masalah utama yang terdeteksi dari snapshot tersebut.
 * @param {Object} logData - Objek snapshot dari Firestore
 * @returns {Array<{type: 'error'|'warning'|'success'|'info', message: string}>}
 */
export function analyzeDebugLog(logData) {
  const analysis = [];

  if (!logData) return analysis;

  // Analisis 1: Koneksi Internet
  if (logData.onlineStatus === 'Offline') {
    analysis.push({
      type: 'error',
      message: '📶 Perangkat kehilangan koneksi internet saat log ini dibuat. Data absensi mungkin gagal tersimpan ke server.'
    });
  }

  // Analisis 2: Status Alat Fingerprint (MQTT)
  if (logData.mqttStatus === 'DISCONNECTED') {
    analysis.push({
      type: 'warning',
      message: '🔌 Aplikasi web terputus dari server MQTT. Jika alat Fingerprint menyala, kemungkinan alat juga kesulitan mengirim data. Periksa jaringan WiFi.'
    });
  }
  
  if (logData.fingerprintStatus === 'READING_ERROR') {
    analysis.push({
      type: 'error',
      message: '🖐️ Alat Fingerprint mendeteksi kesalahan saat membaca jari. Pastikan jari kering, bersih, dan menempel sempurna pada sensor.'
    });
  }

  // Analisis 3: Error JavaScript (Unhandled)
  if (logData.lastError) {
    const err = logData.lastError;
    let errDesc = `Terjadi crash pada aplikasi (JavaScript Error). \nPesan Error: "${err.message}"`;
    
    if (err.type === 'unhandledrejection') {
      errDesc = `⏳ Sebuah proses asinkron gagal (seperti request data) tanpa penanganan. \nPesan Error: "${err.message}"`;
    }

    if (err.stack) {
      // Ambil file sumber jika ada di stack trace
      const firstLine = err.stack.split('\n')[1] || '';
      const match = firstLine.match(/at\s+(.*)/);
      if (match) {
        errDesc += `\nLokasi Crash: ${match[1].trim()}`;
      }
    }

    analysis.push({
      type: 'error',
      message: errDesc
    });
  }

  // Jika tidak ada masalah yang terdeteksi
  if (analysis.length === 0) {
    analysis.push({
      type: 'success',
      message: '✅ Sistem tampak berjalan normal. Tidak ada masalah kritis (error) yang terdeteksi pada snapshot ini.'
    });
  }

  return analysis;
}
