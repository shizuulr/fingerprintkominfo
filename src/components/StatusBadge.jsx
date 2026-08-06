const statusConfig = {
  'Hadir': { className: 'badge--success', label: 'Hadir' },
  'Hadir (KOMINFO)': { className: 'badge--success', label: 'Hadir' },
  'Hadir (SIDEDI)': { className: 'badge--success', label: 'Hadir' },
  'Terlambat': { className: 'badge--warning', label: 'Terlambat' },
  'Terlambat (KOMINFO)': { className: 'badge--warning', label: 'Terlambat' },
  'Belum Absen Keluar': { className: 'badge--info', label: 'Belum Keluar' },
  'Tidak Lengkap': { className: 'badge--warning', label: 'Tidak Lengkap' },
  'Alfa': { className: 'badge--danger', label: 'Alfa' },
  'Izin (S)': { className: 'badge--leave-sick', label: 'Sakit' },
  'Izin (K)': { className: 'badge--leave-school', label: 'Sekolah/Kampus' },
  'Izin (I)': { className: 'badge--leave-other', label: 'Izin Lainnya' },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { className: 'badge--default', label: status };

  return (
    <span className={`badge ${config.className}`}>
      {config.label}
    </span>
  );
}
