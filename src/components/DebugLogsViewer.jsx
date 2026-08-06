import { useState, useEffect } from 'react';
import { LuX, LuTerminal, LuRefreshCw, LuCalendar, LuSmartphone, LuGlobe, LuWifi, LuWifiOff } from 'react-icons/lu';
import Modal from './Modal';
import { getDebugLogs, analyzeDebugLog } from '../services/debugService';

export default function DebugLogsViewer({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDebugLogs(20);
      setLogs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    // Handle Firestore timestamp
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Laporan & Analisis Debug Sistem">
      <div style={{ display: 'flex', flexDirection: 'column', height: '65vh', minHeight: '400px' }}>
        
        {/* Header / Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Menampilkan maksimal 20 log terakhir
          </span>
          <button className="btn btn--secondary" onClick={fetchLogs} disabled={loading} style={{ padding: '6px 12px', fontSize: '12px' }}>
            <LuRefreshCw className={loading ? 'spin' : ''} /> {loading ? 'Memuat...' : 'Muat Ulang'}
          </button>
        </div>

        {/* Content Area */}
        <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
          
          {/* Kiri: Daftar Log */}
          <div style={{ flex: '1', overflowY: 'auto', borderRight: '1px solid var(--border-color)', paddingRight: '12px' }}>
            {loading ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Memuat data log...</p>
            ) : error ? (
              <div className="alert alert--danger">Gagal memuat log: {error}</div>
            ) : logs.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Belum ada log debug yang direkam.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {logs.map((log) => (
                  <li 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    style={{ 
                      padding: '12px', 
                      marginBottom: '8px',
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      border: `1px solid ${selectedLog?.id === log.id ? 'var(--primary-color)' : 'var(--border-color)'}`,
                      backgroundColor: selectedLog?.id === log.id ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-card)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                        <LuCalendar size={14} /> {formatDate(log.timestamp)}
                      </strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <LuSmartphone size={12} /> {log.deviceType}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: log.onlineStatus === 'Online' ? '#10b981' : '#ef4444' }}>
                        {log.onlineStatus === 'Online' ? <LuWifi size={12} /> : <LuWifiOff size={12} />} {log.onlineStatus}
                      </span>
                    </div>
                    {/* Indikator jika ada error */}
                    {log.lastError && (
                      <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '10px', padding: '2px 6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '4px', fontWeight: 'bold' }}>
                        JS Error Detected
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Kanan: Detail & Analisis Log terpilih */}
          <div style={{ flex: '1.5', overflowY: 'auto', paddingLeft: '4px' }}>
            {!selectedLog ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', textAlign: 'center' }}>
                <LuTerminal size={48} style={{ marginBottom: '12px', opacity: 0.2 }} />
                <p>Pilih log di sebelah kiri untuk melihat rincian dan analisis.</p>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  Analisis Laporan
                </h3>
                
                {/* Kotak Analisis Otomatis */}
                <div style={{ marginBottom: '20px' }}>
                  {analyzeDebugLog(selectedLog).map((res, i) => (
                    <div key={i} className={`alert alert--${res.type === 'error' ? 'danger' : res.type === 'warning' ? 'warning' : 'success'}`} style={{ marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                      {res.message}
                    </div>
                  ))}
                </div>

                {/* Raw Data */}
                <h4 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-primary)' }}>Rincian Teknis (Snapshot)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', fontSize: '12px', backgroundColor: 'var(--bg-input)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Waktu (Lokal):</span>
                  <span style={{ color: 'var(--text-primary)' }}>{selectedLog.localTime ? new Date(selectedLog.localTime).toLocaleString() : '-'}</span>
                  
                  <span style={{ color: 'var(--text-secondary)' }}>Perangkat:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{selectedLog.deviceType} ({selectedLog.screenResolution})</span>
                  
                  <span style={{ color: 'var(--text-secondary)' }}>User Agent:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{selectedLog.userAgent}</span>
                  
                  <span style={{ color: 'var(--text-secondary)' }}>Alat Fingerprint:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{selectedLog.fingerprintStatus}</span>
                  
                  <span style={{ color: 'var(--text-secondary)' }}>Server MQTT:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{selectedLog.mqttStatus}</span>
                  
                  <span style={{ color: 'var(--text-secondary)' }}>Koneksi Internet:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{selectedLog.onlineStatus}</span>
                  
                  <span style={{ color: 'var(--text-secondary)' }}>URL:</span>
                  <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{selectedLog.currentUrl}</span>
                </div>

                {/* Stack Trace Error (jika ada) */}
                {selectedLog.lastError && (
                  <div style={{ marginTop: '16px' }}>
                    <h4 style={{ fontSize: '14px', marginBottom: '8px', color: '#ef4444' }}>Stack Trace Error:</h4>
                    <pre style={{ 
                      fontSize: '11px', 
                      backgroundColor: '#1e1e1e', 
                      color: '#d4d4d4', 
                      padding: '12px', 
                      borderRadius: '6px',
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {selectedLog.lastError.stack || selectedLog.lastError.message}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </Modal>
  );
}
