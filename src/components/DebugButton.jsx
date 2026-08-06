/**
 * ============================================================================
 * DebugButton.jsx — Floating Debug Button Component
 * ============================================================================
 * Tombol mengambang di pojok kanan bawah layar untuk:
 *  1. Membuka Eruda (in-app DevTools console)
 *  2. Mengirim snapshot debug ke Firebase Firestore
 *
 * Visibilitas:
 *  - Default: tersembunyi
 *  - Tampil jika URL mengandung ?debug=true
 *  - Tampil jika user tap 5x pada judul "SIAP" di Sidebar
 *  - State disimpan di localStorage agar persisten
 *
 * Event 'debug-mode-activated' didengarkan dari Sidebar.jsx
 * untuk mengaktifkan tombol debug via tap 5x.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { toggleEruda, sendDebugSnapshot, getDeviceType } from '../services/debugService';

export default function DebugButton() {
  // ── State: apakah tombol debug terlihat ──
  const [isVisible, setIsVisible] = useState(() => {
    // Cek localStorage untuk persistensi
    return localStorage.getItem('debugMode') === 'true';
  });

  // ── State: loading saat mengirim snapshot ──
  const [isSending, setIsSending] = useState(false);

  // ── State: toast notification ──
  const [toast, setToast] = useState(null);

  // ── Cek URL query parameter saat mount ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'true') {
      setIsVisible(true);
      localStorage.setItem('debugMode', 'true');
    }
  }, []);

  // ── Dengarkan event dari Sidebar (tap 5x) atau Settings ──
  useEffect(() => {
    const handleActivate = () => {
      setIsVisible(true);
      localStorage.setItem('debugMode', 'true');
      showToast('Debug mode diaktifkan!', 'info');
    };
    const handleDeactivate = () => {
      setIsVisible(false);
      localStorage.removeItem('debugMode');
      showToast('Debug mode dinonaktifkan.', 'info');
    };

    window.addEventListener('debug-mode-activated', handleActivate);
    window.addEventListener('debug-mode-deactivated', handleDeactivate);
    return () => {
      window.removeEventListener('debug-mode-activated', handleActivate);
      window.removeEventListener('debug-mode-deactivated', handleDeactivate);
    };
  }, []);

  // ── Toast helper ──
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Handler: klik tombol debug ──
  const handleDebugClick = async () => {
    setIsSending(true);

    try {
      // 1. Muat/toggle Eruda console
      await toggleEruda();

      // 2. Kirim snapshot debug ke Firebase
      const result = await sendDebugSnapshot();

      if (result.success) {
        showToast(`✅ ${result.message} (${getDeviceType()})`, 'success');
      } else {
        showToast(`❌ ${result.message}`, 'error');
      }
    } catch (err) {
      showToast(`❌ Error: ${err.message}`, 'error');
    }

    setIsSending(false);
  };

  // ── Handler: sembunyikan tombol debug (double-click) ──
  const handleHideDebug = () => {
    setIsVisible(false);
    localStorage.removeItem('debugMode');
    showToast('Debug mode dinonaktifkan.', 'info');
  };

  // Jika tidak visible, tidak render apa-apa
  if (!isVisible) return null;

  return (
    <>
      {/* ── Floating Debug Button ── */}
      <button
        onClick={handleDebugClick}
        onDoubleClick={handleHideDebug}
        disabled={isSending}
        title="Klik: Buka Debug Console + Kirim Snapshot | Double-klik: Sembunyikan"
        style={{
          position: 'fixed',
          bottom: '80px',          // Di atas bottom-nav mobile
          right: '20px',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 16px',
          border: 'none',
          borderRadius: '50px',
          background: isSending
            ? 'linear-gradient(135deg, #6b7280, #4b5563)'
            : 'linear-gradient(135deg, #ef4444, #f97316)',
          color: '#fff',
          fontSize: '13px',
          fontWeight: '700',
          cursor: isSending ? 'wait' : 'pointer',
          boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4), 0 2px 8px rgba(0,0,0,0.2)',
          transition: 'all 0.3s ease',
          opacity: isSending ? 0.7 : 0.9,
          // Animasi pulse
          animation: !isSending ? 'debugPulse 2s ease-in-out infinite' : 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.05)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={{ fontSize: '16px' }}></span>
        {isSending ? 'Mengirim...' : 'Debug'}
      </button>

      {/* ── Toast Notification ── */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '140px',
            right: '20px',
            zIndex: 100000,
            padding: '12px 20px',
            borderRadius: '12px',
            background: toast.type === 'success'
              ? 'linear-gradient(135deg, #10b981, #059669)'
              : toast.type === 'error'
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            maxWidth: '320px',
            wordBreak: 'break-word',
            animation: 'debugToastIn 0.3s ease-out',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* ── CSS Animations (injected inline via style tag) ── */}
      <style>{`
        @keyframes debugPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4), 0 2px 8px rgba(0,0,0,0.2); }
          50% { box-shadow: 0 4px 30px rgba(239, 68, 68, 0.6), 0 2px 12px rgba(0,0,0,0.3); }
        }
        @keyframes debugToastIn {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
