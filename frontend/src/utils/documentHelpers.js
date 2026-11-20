export function getSubmissionFieldType(label = '') {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (['nama', 'nama karyawan', 'nama pemohon', 'employee name'].includes(normalized)) {
    return 'applicantName'
  }
  if (
    [
      'tujuan',
      'tujuan pengajuan',
      'keperluan',
      'keperluan pengajuan',
      'purpose',
      'application purpose',
    ].includes(normalized)
  ) {
    return 'purpose'
  }
  if (['tgl pengajuan', 'tanggal pengajuan'].includes(normalized)) {
    return 'applicationDate'
  }
  return null
}

export function getTodayDateInput() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

export function buildSubmissionName({ purpose, applicantName, applicationDate }) {
  const safePart = (value) =>
    String(value || '')
      .split('')
      .filter((character) => character.charCodeAt(0) >= 32)
      .join('')
      .replace(/[<>:"/\\|?*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[. ]+|[. ]+$/g, '')
  const date = applicationDate ? applicationDate.split('-').reverse().join('') : ''
  return `Pengajuan ${safePart(purpose) || '[tujuan]'} - ${safePart(applicantName) || '[nama]'} ${date || '[tanggalbulantahun]'}`
}

export function formatDate(value) {
  if (!value) return 'Tanggal tidak tersedia'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia'

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}
