/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { collection, addDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { setFingerprintStatus } from '../services/debugService';

const MQTT_BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
const TOPIC_SCAN = 'absensipkl_temanggung_2026/scan';
const TOPIC_ENROLL_REQUEST = 'absensipkl_temanggung_2026/enroll_request';
const TOPIC_ENROLL_RESULT = 'absensipkl_temanggung_2026/enroll_result';
const TOPIC_DELETE_REQUEST = 'absensipkl_temanggung_2026/delete_request';
const TOPIC_DELETE_RESULT = 'absensipkl_temanggung_2026/delete_result';
const TOPIC_RESET_REQUEST = 'absensipkl_temanggung_2026/reset_request';
const TOPIC_HEARTBEAT = 'absensipkl_temanggung_2026/web_heartbeat';

const HEARTBEAT_INTERVAL_MS = 10000; // 10 detik

// Callback untuk meneruskan hasil delete_result ke komponen pemanggil
let deleteResultCallback = null;

export function registerDeleteResultCallback(fn) {
  deleteResultCallback = fn;
}

export function unregisterDeleteResultCallback() {
  deleteResultCallback = null;
}

/**
 * Mengecek apakah koneksi MQTT saat ini aktif.
 * Bisa dipanggil dari komponen lain untuk menampilkan status koneksi.
 * @returns {boolean}
 */
export function isMqttConnected() {
  return window.mqttClient && window.mqttClient.connected;
}

/**
 * Komponen ini berjalan di background (di-mount di App.jsx).
 * Menangani 2 arah komunikasi MQTT:
 * 1. Menerima 'scan' (absen) dari ESP32 -> tulis ke raw_scans
 * 2. Menerima 'enroll_result' dari ESP32 -> update fingerprintId di users
 * 3. Mempublish heartbeat retained setiap 10 detik ke topic web_heartbeat,
 *    agar ESP32 bisa menentukan jalur pengiriman data (MQTT vs HTTPS).
 * Juga menyediakan fungsi publishEnrollRequest() untuk dipanggil
 * dari halaman pendaftaran user, supaya bisa mengirim 'enroll_request'.
 */
export default function MqttListener() {
  const clientRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);

  useEffect(() => {
    const client = mqtt.connect(MQTT_BROKER_URL, {
      clientId: 'dashboard-' + Math.random().toString(16).substring(2, 8),
      reconnectPeriod: 3000,
    });

    clientRef.current = client;

    // Simpan referensi client secara global supaya bisa dipanggil dari komponen lain
    // (lihat penjelasan di bawah soal window.mqttClient)
    window.mqttClient = client;

    client.on('connect', () => {
      console.log('MQTT: terhubung ke broker HiveMQ');
      setFingerprintStatus('CONNECTED');
      client.subscribe(TOPIC_SCAN);
      client.subscribe(TOPIC_ENROLL_RESULT);
      client.subscribe(TOPIC_DELETE_RESULT);

      // ── Heartbeat Publisher ──
      // Kirim heartbeat retained pertama segera setelah terhubung,
      // lalu ulang setiap 10 detik. Retained = true supaya ESP32 yang
      // baru reconnect/reboot langsung tahu timestamp heartbeat terakhir
      // tanpa menunggu interval berikutnya.
      const publishHeartbeat = () => {
        if (client.connected) {
          const payload = JSON.stringify({ timestamp: Date.now() });
          client.publish(TOPIC_HEARTBEAT, payload, { retain: true, qos: 1 });
        }
      };

      // Kirim langsung satu kali saat connect
      publishHeartbeat();

      // Bersihkan interval lama jika ada (bisa terjadi saat reconnect)
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      heartbeatIntervalRef.current = setInterval(publishHeartbeat, HEARTBEAT_INTERVAL_MS);
      console.log('MQTT: heartbeat publisher aktif (interval 10 detik, retained)');
    });

    client.on('message', async (topic, message) => {
      const payloadStr = message.toString();
      console.log('MQTT: pesan diterima ->', topic, payloadStr);

      try {
        const data = JSON.parse(payloadStr);

        if (topic === TOPIC_SCAN) {
          setFingerprintStatus('READING');
          await handleScanMessage(data);
        } else if (topic === TOPIC_ENROLL_RESULT) {
          await handleEnrollResult(data);
        } else if (topic === TOPIC_DELETE_RESULT) {
          handleDeleteResult(data);
        }
      } catch (error) {
        console.error('MQTT: gagal memproses pesan', error);
      }
    });

    client.on('error', (err) => {
      console.error('MQTT: connection error', err);
      setFingerprintStatus('DISCONNECTED');
    });

    // Menangani masalah "Page entered Back-Forward Cache" & background throttling
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && clientRef.current && !clientRef.current.connected) {
        console.log('MQTT: Tab aktif kembali, memaksa reconnect...');
        clientRef.current.reconnect();
      }
    };
    
    const handlePageShow = (e) => {
      if (e.persisted && clientRef.current && !clientRef.current.connected) {
        console.log('MQTT: Halaman dipulihkan dari BFCache, memaksa reconnect...');
        clientRef.current.reconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      // Bersihkan heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
      client.end(true); // force close untuk mencegah koneksi zombie saat React StrictMode / Hot-Reload
      setFingerprintStatus('DISCONNECTED');
      window.mqttClient = null;
    };
  }, []);

  return null;
}

async function handleScanMessage(data) {
  if (data.fingerprintId === undefined || data.fingerprintId === null) {
    console.error('MQTT: payload scan tidak valid');
    return;
  }

  try {
    await addDoc(collection(db, 'raw_scans'), {
      fingerprintId: Number(data.fingerprintId),
      status: 'pending',
      receivedAt: Timestamp.fromDate(new Date()),
      source: 'mqtt',
    });
    console.log('MQTT: scan berhasil diteruskan ke raw_scans');
  } catch (error) {
    console.error('MQTT: gagal menyimpan scan ke raw_scans', error);
    setFingerprintStatus('ERROR');
  }
}

async function handleEnrollResult(data) {
  const { docId, success, fingerprintId } = data;

  if (!docId) {
    console.error('MQTT: enroll_result tidak punya docId');
    return;
  }

  try {
    if (success) {
      await updateDoc(doc(db, 'users', docId), {
        fingerprintId: Number(fingerprintId),
        status: 'aktif',
        enrolledAt: Timestamp.fromDate(new Date()),
      });
      console.log(`MQTT: enroll berhasil, user ${docId} -> fingerprintId ${fingerprintId}`);
    } else {
      await updateDoc(doc(db, 'users', docId), {
        status: 'gagal_enroll',
      });
      console.log(`MQTT: enroll gagal untuk user ${docId}`);
    }
  } catch (error) {
    console.error(`MQTT: gagal update doc user ${docId}`, error);
    setFingerprintStatus('ERROR');
  }
}

function handleDeleteResult(data) {
  const { fingerprintId, success } = data;
  console.log(`MQTT: delete_result diterima — ID ${fingerprintId}, sukses: ${success}`);

  // Hapus retained message di broker setelah ESP32 berhasil memproses delete.
  // Ini mencegah perintah hapus dieksekusi ulang saat ESP32 restart berikutnya.
  if (success && window.mqttClient?.connected) {
    window.mqttClient.publish(TOPIC_DELETE_REQUEST, '', { retain: true, qos: 1 });
    console.log('MQTT: retained delete_request dibersihkan dari broker');
  }

  if (deleteResultCallback) {
    deleteResultCallback(data);
  }
}

/**
 * Fungsi ini dipanggil dari halaman pendaftaran (UserManagement.jsx)
 * setelah data user baru berhasil disimpan ke Firestore.
 * Mempublish permintaan enroll ke ESP32 lewat MQTT.
 */
export function publishEnrollRequest(docId, name) {
  if (!window.mqttClient || !window.mqttClient.connected) {
    console.error('MQTT: client belum terhubung, tidak bisa kirim enroll_request');
    return false;
  }

  const payload = JSON.stringify({ docId, name });
  window.mqttClient.publish(TOPIC_ENROLL_REQUEST, payload);
  console.log('MQTT: enroll_request dikirim ->', payload);
  return true;
}

export function publishDeleteRequest(fingerprintId) {
  if (!window.mqttClient || !window.mqttClient.connected) {
    console.error('MQTT: client belum terhubung, tidak bisa kirim delete_request');
    return false;
  }

  const payload = JSON.stringify({ fingerprintId });
  // retain: true  → pesan disimpan di broker HiveMQ.
  // Jika ESP32 sedang reboot saat perintah ini dikirim, pesan tetap tersimpan
  // dan akan dikirim otomatis ke ESP32 begitu ia subscribe kembali saat boot.
  // qos: 1 → pastikan pesan terkirim minimal 1 kali.
  window.mqttClient.publish(TOPIC_DELETE_REQUEST, payload, { retain: true, qos: 1 });
  console.log('MQTT: delete_request dikirim (retained) ->', payload);
  return true;
}

export function publishClearAllRequest() {
  if (!window.mqttClient || !window.mqttClient.connected) {
    console.error('MQTT: client belum terhubung, tidak bisa kirim clear_all_request');
    return false;
  }

  // Mengirim perintah dengan ID "ALL" sebagai penanda reset total sensor.
  // retain: true  → pesan disimpan di broker HiveMQ.
  // Jika ESP32 sedang reboot saat perintah ini dikirim, pesan tetap tersimpan
  // dan akan dikirim otomatis ke ESP32 begitu ia subscribe kembali saat boot.
  // qos: 1 → pastikan pesan terkirim minimal 1 kali.
  const payload = JSON.stringify({ fingerprintId: 'ALL' });
  window.mqttClient.publish(TOPIC_DELETE_REQUEST, payload, { retain: true, qos: 1 });
  console.log('MQTT: clear_all request dikirim (retained) ->', payload);
  return true;
}

/**
 * Mengirim perintah reset (restart) ke ESP32 melalui MQTT.
 * ESP32 akan memanggil ESP.restart() saat menerima pesan ini.
 * retain: true → agar pesan tersimpan di broker jika ESP32 sedang offline.
 * Setelah ESP32 restart dan subscribe ulang, ia akan menerima pesan ini,
 * lalu membersihkan retained message agar tidak loop restart.
 */
export function publishResetRequest() {
  if (!window.mqttClient || !window.mqttClient.connected) {
    console.error('MQTT: client belum terhubung, tidak bisa kirim reset_request');
    return false;
  }

  const payload = JSON.stringify({ action: 'restart', timestamp: Date.now() });
  window.mqttClient.publish(TOPIC_RESET_REQUEST, payload, { retain: false, qos: 1 });
  console.log('MQTT: reset_request dikirim ->', payload);
  return true;
}


