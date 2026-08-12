/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { collection, addDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const MQTT_BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
const TOPIC_SCAN = 'absensipkl_temanggung_2026/scan';
const TOPIC_ENROLL_REQUEST = 'absensipkl_temanggung_2026/enroll_request';
const TOPIC_ENROLL_RESULT = 'absensipkl_temanggung_2026/enroll_result';
const TOPIC_DELETE_REQUEST = 'absensipkl_temanggung_2026/delete_request';
const TOPIC_DELETE_RESULT = 'absensipkl_temanggung_2026/delete_result';

// Callback untuk meneruskan hasil delete_result ke komponen pemanggil
let deleteResultCallback = null;

export function registerDeleteResultCallback(fn) {
    deleteResultCallback = fn;
}

export function unregisterDeleteResultCallback() {
    deleteResultCallback = null;
}

/**
 * Komponen ini berjalan di background (di-mount di App.jsx).
 * Menangani 2 arah komunikasi MQTT:
 * 1. Menerima 'scan' (absen) dari ESP32 -> tulis ke raw_scans
 * 2. Menerima 'enroll_result' dari ESP32 -> update fingerprintId di users
 * Juga menyediakan fungsi publishEnrollRequest() untuk dipanggil
 * dari halaman pendaftaran user, supaya bisa mengirim 'enroll_request'.
 */
export default function MqttListener() {
    const clientRef = useRef(null);

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
            client.subscribe(TOPIC_SCAN);
            client.subscribe(TOPIC_ENROLL_RESULT);
            client.subscribe(TOPIC_DELETE_RESULT);
        });

        client.on('message', async (topic, message) => {
            const payloadStr = message.toString();
            console.log('MQTT: pesan diterima ->', topic, payloadStr);

            try {
                const data = JSON.parse(payloadStr);

                if (topic === TOPIC_SCAN) {
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
        });

        return () => {
            client.end();
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

    await addDoc(collection(db, 'raw_scans'), {
        fingerprintId: Number(data.fingerprintId),
        status: 'pending',
        receivedAt: Timestamp.fromDate(new Date()),
        source: 'mqtt',
    });

    console.log('MQTT: scan berhasil diteruskan ke raw_scans');
}

async function handleEnrollResult(data) {
    const { docId, success, fingerprintId } = data;

    if (!docId) {
        console.error('MQTT: enroll_result tidak punya docId');
        return;
    }

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
}

function handleDeleteResult(data) {
    const { fingerprintId, success } = data;
    console.log(`MQTT: delete_result diterima — ID ${fingerprintId}, sukses: ${success}`);
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
    window.mqttClient.publish(TOPIC_DELETE_REQUEST, payload);
    console.log('MQTT: delete_request dikirim ->', payload);
    return true;
}

export function publishClearAllRequest() {
    if (!window.mqttClient || !window.mqttClient.connected) {
        console.error('MQTT: client belum terhubung, tidak bisa kirim clear_all_request');
        return false;
    }

    // Mengirim perintah dengan ID "ALL" sebagai penanda reset total
    const payload = JSON.stringify({ fingerprintId: "ALL" });
    window.mqttClient.publish(TOPIC_DELETE_REQUEST, payload);
    console.log('MQTT: clear_all request dikirim ->', payload);
    return true;
}
