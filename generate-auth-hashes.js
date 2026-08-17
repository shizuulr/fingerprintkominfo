/**
 * Script node.js untuk generate SHA-256 hash dari kredensial admin SIAP.
 * Jalankan sekali: node generate-auth-hashes.js
 * Lalu salin output ke file .env
 */
import { createHash } from 'crypto';

function sha256(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

const USERNAME  = 'AdmSIAP_Tmg';
const PASSWORD  = 'D1sK0m!nf0#26';
const RECOVERY  = 'TMG-SIAP-2026-R7K#';

console.log('\n=== HASH KREDENSIAL SIAP ===');
console.log(`VITE_AUTH_USERNAME_HASH=${sha256(USERNAME)}`);
console.log(`VITE_AUTH_PASSWORD_HASH=${sha256(PASSWORD)}`);
console.log(`VITE_AUTH_RECOVERY_HASH=${sha256(RECOVERY)}`);
console.log('\nSalin 3 baris di atas ke file .env Anda.\n');
