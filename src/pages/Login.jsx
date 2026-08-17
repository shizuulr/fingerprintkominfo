import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuFingerprint, LuEye, LuEyeOff, LuLock, LuUser, LuShieldAlert, LuBadgeCheck } from 'react-icons/lu';
import { useAuth } from '../context/AuthContext';

/* ──────────────────────────────────────────
   Fungsi hash SHA-256 sederhana via Web Crypto API
   Tidak butuh library eksternal.
────────────────────────────────────────── */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ──────────────────────────────────────────
   Hash dari kredensial admin.
   Nilai dari .env dipakai sebagai default.
   Jika admin pernah reset sandi, override tersimpan di localStorage
   dan diprioritaskan agar login tetap berfungsi tanpa rebuild app.
────────────────────────────────────────── */
function getActiveHash(key, envValue) {
  return localStorage.getItem(key) || envValue;
}
const ADMIN_USERNAME_HASH = getActiveHash('siap_override_username_hash', import.meta.env.VITE_AUTH_USERNAME_HASH);
const ADMIN_PASSWORD_HASH = getActiveHash('siap_override_password_hash', import.meta.env.VITE_AUTH_PASSWORD_HASH);
const RECOVERY_CODE_HASH  = import.meta.env.VITE_AUTH_RECOVERY_HASH;

/* ── Tampilan fase ── */
const PHASE_LOGIN    = 'login';
const PHASE_RECOVERY = 'recovery';
const PHASE_RESET    = 'reset';
const PHASE_SUCCESS  = 'success';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  /* ── state fase ── */
  const [phase, setPhase] = useState(PHASE_LOGIN);

  /* ── form login ── */
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  /* ── form recovery ── */
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  /* ── form reset password ── */
  const [newUsername, setNewUsername]     = useState('');
  const [newPassword, setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass]     = useState(false);
  const [resetError, setResetError]       = useState('');
  const [resetLoading, setResetLoading]   = useState(false);

  /* ───────────────────── HANDLER LOGIN ───────────────────── */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      const [uHash, pHash] = await Promise.all([
        sha256(username.trim()),
        sha256(password),
      ]);

      if (uHash === ADMIN_USERNAME_HASH && pHash === ADMIN_PASSWORD_HASH) {
        login();
        navigate('/', { replace: true });
      } else {
        setLoginError('Username atau sandi salah. Silakan coba lagi.');
      }
    } catch {
      setLoginError('Terjadi kesalahan. Coba lagi.');
    } finally {
      setLoginLoading(false);
    }
  };

  /* ─────────────── HANDLER VERIFIKASI KODE PEMULIHAN ─────── */
  const handleVerifyRecovery = async (e) => {
    e.preventDefault();
    setRecoveryError('');

    const hash = await sha256(recoveryCode.trim());
    if (hash === RECOVERY_CODE_HASH) {
      setPhase(PHASE_RESET);
    } else {
      setRecoveryError('Kode pemulihan salah.');
    }
  };

  /* ──────────────── HANDLER RESET SANDI ──────────────────── */
  const handleReset = async (e) => {
    e.preventDefault();
    setResetError('');

    if (!newUsername.trim()) {
      setResetError('Username baru tidak boleh kosong.');
      return;
    }
    if (newPassword.length < 6) {
      setResetError('Sandi baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Konfirmasi sandi tidak cocok.');
      return;
    }

    setResetLoading(true);
    try {
      const [uHash, pHash] = await Promise.all([
        sha256(newUsername.trim()),
        sha256(newPassword),
      ]);

      // Simpan hash baru ke localStorage supaya dipakai saat login berikutnya
      localStorage.setItem('siap_override_username_hash', uHash);
      localStorage.setItem('siap_override_password_hash', pHash);

      setPhase(PHASE_SUCCESS);
    } catch {
      setResetError('Gagal menyimpan sandi baru. Coba lagi.');
    } finally {
      setResetLoading(false);
    }
  };

  /* ─────────────── RENDER ───────────────────────────────── */
  return (
    <div className="login-page">
      {/* Background animated blobs */}
      <div className="login-bg">
        <div className="login-blob login-blob--1" />
        <div className="login-blob login-blob--2" />
        <div className="login-blob login-blob--3" />
      </div>

      <div className="login-card">
        {/* Logo & Brand */}
        <div className="login-brand">
          <div className="login-logo-ring">
            <img src="/logo-temanggung.png" alt="Logo Temanggung" className="login-logo-img" />
          </div>
          <h1 className="login-title">SIAP</h1>
          <p className="login-subtitle">Sistem Informasi Absensi PKL</p>
          <p className="login-org">Dinas Kominfo Kab. Temanggung</p>
        </div>

        {/* ── FASE: LOGIN ── */}
        {phase === PHASE_LOGIN && (
          <form onSubmit={handleLogin} className="login-form" autoComplete="off">
            <div className="login-field">
              <label className="login-label" htmlFor="login-username">
                <LuUser size={14} /> Username
              </label>
              <div className="login-input-wrap">
                <input
                  id="login-username"
                  type="text"
                  className="login-input"
                  placeholder="Masukkan username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setLoginError(''); }}
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="login-password">
                <LuLock size={14} /> Sandi
              </label>
              <div className="login-input-wrap login-input-wrap--icon">
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  className="login-input"
                  placeholder="Masukkan sandi"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setLoginError(''); }}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPass((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPass ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                >
                  {showPass ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="login-error">
                <LuShieldAlert size={14} /> {loginError}
              </div>
            )}

            <button
              type="submit"
              className="login-btn"
              id="login-submit-btn"
              disabled={loginLoading}
            >
              {loginLoading ? (
                <span className="login-spinner" />
              ) : (
                <>
                  <LuFingerprint size={18} /> Masuk
                </>
              )}
            </button>

            <button
              type="button"
              className="login-forgot"
              onClick={() => { setPhase(PHASE_RECOVERY); setLoginError(''); }}
            >
              Lupa sandi?
            </button>
          </form>
        )}

        {/* ── FASE: MASUKKAN KODE PEMULIHAN ── */}
        {phase === PHASE_RECOVERY && (
          <form onSubmit={handleVerifyRecovery} className="login-form">
            <div className="login-recovery-info">
              <LuShieldAlert size={20} />
              <p>Masukkan <strong>Kode Pemulihan</strong> yang telah Anda simpan sebelumnya.</p>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="recovery-code">
                <LuLock size={14} /> Kode Pemulihan
              </label>
              <div className="login-input-wrap">
                <input
                  id="recovery-code"
                  type="text"
                  className="login-input"
                  placeholder="Contoh: TMG-XXXX-XXXX"
                  value={recoveryCode}
                  onChange={(e) => { setRecoveryCode(e.target.value); setRecoveryError(''); }}
                  required
                />
              </div>
            </div>

            {recoveryError && (
              <div className="login-error">
                <LuShieldAlert size={14} /> {recoveryError}
              </div>
            )}

            <button type="submit" className="login-btn" id="recovery-submit-btn">
              Verifikasi Kode
            </button>
            <button
              type="button"
              className="login-forgot"
              onClick={() => { setPhase(PHASE_LOGIN); setRecoveryCode(''); setRecoveryError(''); }}
            >
              ← Kembali ke Login
            </button>
          </form>
        )}

        {/* ── FASE: RESET SANDI ── */}
        {phase === PHASE_RESET && (
          <form onSubmit={handleReset} className="login-form">
            <div className="login-recovery-info login-recovery-info--success">
              <LuBadgeCheck size={20} />
              <p>Kode valid. Silakan atur <strong>username &amp; sandi baru</strong>.</p>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="new-username">
                <LuUser size={14} /> Username Baru
              </label>
              <div className="login-input-wrap">
                <input
                  id="new-username"
                  type="text"
                  className="login-input"
                  placeholder="Username baru"
                  value={newUsername}
                  onChange={(e) => { setNewUsername(e.target.value); setResetError(''); }}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="new-password">
                <LuLock size={14} /> Sandi Baru
              </label>
              <div className="login-input-wrap login-input-wrap--icon">
                <input
                  id="new-password"
                  type={showNewPass ? 'text' : 'password'}
                  className="login-input"
                  placeholder="Minimal 6 karakter"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setResetError(''); }}
                  required
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowNewPass((v) => !v)}
                  tabIndex={-1}
                >
                  {showNewPass ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="confirm-password">
                <LuLock size={14} /> Konfirmasi Sandi Baru
              </label>
              <div className="login-input-wrap">
                <input
                  id="confirm-password"
                  type="password"
                  className="login-input"
                  placeholder="Ulangi sandi baru"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setResetError(''); }}
                  required
                />
              </div>
            </div>

            {resetError && (
              <div className="login-error">
                <LuShieldAlert size={14} /> {resetError}
              </div>
            )}

            <button
              type="submit"
              className="login-btn"
              id="reset-submit-btn"
              disabled={resetLoading}
            >
              {resetLoading ? <span className="login-spinner" /> : 'Simpan Sandi Baru'}
            </button>
          </form>
        )}

        {/* ── FASE: SUKSES RESET ── */}
        {phase === PHASE_SUCCESS && (
          <div className="login-form login-success-phase">
            <div className="login-recovery-info login-recovery-info--success">
              <LuBadgeCheck size={32} />
              <p>Sandi berhasil diperbarui! Silakan login kembali dengan kredensial baru Anda.</p>
            </div>
            <button
              className="login-btn"
              id="go-to-login-btn"
              onClick={() => {
                setPhase(PHASE_LOGIN);
                setUsername('');
                setPassword('');
                setNewUsername('');
                setNewPassword('');
                setConfirmPassword('');
                setRecoveryCode('');
              }}
            >
              <LuFingerprint size={18} /> Ke Halaman Login
            </button>
          </div>
        )}

        <p className="login-footer">© 2026 Dinas Kominfo Kab. Temanggung</p>
      </div>
    </div>
  );
}
