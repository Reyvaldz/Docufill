import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Copy as CopyIcon,
  Download,
  Eye,
  FileText,
  Files,
  FolderKanban,
  Image,
  LayoutGrid,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const apiAssetUrl = (path) => `${API_URL.replace(/\/api\/?$/, '')}${path}`

const defaultDashboard = {
  total_templates: 0,
  total_documents: 0,
  total_categories: 0,
  latest_documents: [],
  recent_activity: [],
}

const statusStyles = {
  approved: 'bg-emerald-100 text-emerald-800',
  generated: 'bg-blue-100 text-blue-800',
  pending: 'bg-amber-100 text-amber-800',
  draft: 'bg-slate-200 text-slate-700',
}

const navigation = [
  { label: 'Dashboard', icon: LayoutGrid, target: 'dashboard' },
  { label: 'Templates', icon: FileText, target: 'templates' },
  { label: 'Documents', icon: FolderKanban, target: 'documents' },
  { label: 'All Documents', icon: Files, target: 'all-documents' },
  { label: 'Email Templates', icon: Mail, target: 'email-templates' },
]

const pageTitles = {
  dashboard: 'Dashboard',
  templates: 'Templates',
  documents: 'Documents',
  'all-documents': 'All Documents',
  'email-templates': 'Email Templates',
}

const WALLPAPER_STORAGE_KEY = 'docufill.wallpaper'
const wallpaperPresets = [
  { id: 'plain', label: 'Polos', background: '#f1f5f9' },
  {
    id: 'ocean',
    label: 'Biru laut',
    background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 48%, #ccfbf1 100%)',
  },
  {
    id: 'lavender',
    label: 'Lavender',
    background: 'linear-gradient(135deg, #ede9fe 0%, #f5f3ff 52%, #dbeafe 100%)',
  },
  {
    id: 'sunset',
    label: 'Senja',
    background: 'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fce7f3 100%)',
  },
  {
    id: 'forest',
    label: 'Hutan',
    background: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #ccfbf1 100%)',
  },
]

function loadSavedWallpaper() {
  try {
    const saved = localStorage.getItem(WALLPAPER_STORAGE_KEY)
    if (!saved) return { type: 'preset', value: 'plain' }

    const wallpaper = JSON.parse(saved)
    const knownPreset = wallpaperPresets.some((preset) => preset.id === wallpaper.value)
    if (wallpaper.type === 'preset' && knownPreset) {
      return wallpaper
    }
    if (wallpaper.type === 'image' && wallpaper.value?.startsWith('data:image/jpeg;base64,')) {
      return wallpaper
    }
    return { type: 'preset', value: 'plain' }
  } catch (error) {
    console.error('Unable to load saved wallpaper', error)
    return { type: 'preset', value: 'plain' }
  }
}

function getSubmissionFieldType(label = '') {
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

function getTodayDateInput() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

function buildSubmissionName({ purpose, applicantName, applicationDate }) {
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

function App() {
  const [dashboard, setDashboard] = useState(defaultDashboard)
  const [templates, setTemplates] = useState([])
  const [documents, setDocuments] = useState([])
  const [categories, setCategories] = useState([])
  const [emailRecipients, setEmailRecipients] = useState([])
  const [emailTemplates, setEmailTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const [wallpaper, setWallpaper] = useState(loadSavedWallpaper)
  const [wallpaperBusy, setWallpaperBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingTemplateId, setDeletingTemplateId] = useState(null)
  const [deletingDocumentId, setDeletingDocumentId] = useState(null)
  const [openingDocumentId, setOpeningDocumentId] = useState(null)
  const [formTemplateId, setFormTemplateId] = useState('')
  const [documentMode, setDocumentMode] = useState('create')
  const [editingDocumentId, setEditingDocumentId] = useState(null)
  const [documentName, setDocumentName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [applicantName, setApplicantName] = useState('')
  const [applicationDate, setApplicationDate] = useState(getTodayDateInput)
  const [folderName, setFolderName] = useState('')
  const [evidencePhotos, setEvidencePhotos] = useState([])
  const [templateAnalysis, setTemplateAnalysis] = useState(null)
  const [analysisError, setAnalysisError] = useState('')
  const [formFields, setFormFields] = useState({})
  const [customFields, setCustomFields] = useState([])
  const [itemRows, setItemRows] = useState([{}])
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [templateFieldAnalysis, setTemplateFieldAnalysis] = useState(null)
  const [templateAnalysisError, setTemplateAnalysisError] = useState('')
  const [templateCustomFields, setTemplateCustomFields] = useState([])
  const [folderPreview, setFolderPreview] = useState(null)
  const [folderWorkflowStep, setFolderWorkflowStep] = useState('review')
  const [folderWorkflowError, setFolderWorkflowError] = useState('')
  const [selectedEmailRecipients, setSelectedEmailRecipients] = useState([])
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [folderZipBusy, setFolderZipBusy] = useState(false)
  const [newRecipientEmail, setNewRecipientEmail] = useState('')
  const [emailTemplateForm, setEmailTemplateForm] = useState({
    name: '',
    recipients: [],
    subject: '{document_name}',
    body: '',
  })
  const [editingEmailTemplateId, setEditingEmailTemplateId] = useState(null)

  const spreadsheetTemplates = templates.filter((template) =>
    template.file_name?.toLowerCase().endsWith('.xlsx'),
  )
  const submissionFields = {
    purpose:
      templateAnalysis?.fields.find((field) => getSubmissionFieldType(field.label) === 'purpose') ||
      customFields.find((field) => getSubmissionFieldType(field.label) === 'purpose'),
    applicantName:
      templateAnalysis?.fields.find(
        (field) => getSubmissionFieldType(field.label) === 'applicantName',
      ) || customFields.find((field) => getSubmissionFieldType(field.label) === 'applicantName'),
    applicationDate:
      templateAnalysis?.fields.find(
        (field) => getSubmissionFieldType(field.label) === 'applicationDate',
      ) || customFields.find((field) => getSubmissionFieldType(field.label) === 'applicationDate'),
  }
  const getCurrentSubmissionValue = (kind) => {
    const mappedField = submissionFields[kind]
    if (!mappedField) {
      return {
        purpose,
        applicantName,
        applicationDate,
      }[kind]
    }
    if (templateAnalysis?.fields.some((field) => field.key === mappedField.key)) {
      return formFields[mappedField.key] || ''
    }
    return customFields.find((field) => field.key === mappedField.key)?.value || ''
  }

  const refreshData = async () => {
    const [
      dashboardResponse,
      templatesResponse,
      documentsResponse,
      categoriesResponse,
      emailRecipientsResponse,
      emailTemplatesResponse,
    ] = await Promise.all([
      axios.get(`${API_URL}/dashboard`),
      axios.get(`${API_URL}/templates`),
      axios.get(`${API_URL}/documents`),
      axios.get(`${API_URL}/categories`),
      axios.get(`${API_URL}/email/recipients`),
      axios.get(`${API_URL}/email/templates`),
    ])

    if (
      !dashboardResponse.data ||
      typeof dashboardResponse.data !== 'object' ||
      !Array.isArray(templatesResponse.data) ||
      !Array.isArray(documentsResponse.data) ||
      !Array.isArray(categoriesResponse.data) ||
      !Array.isArray(emailRecipientsResponse.data) ||
      !Array.isArray(emailTemplatesResponse.data)
    ) {
      throw new Error('API mengembalikan data dengan format yang tidak valid.')
    }

    setDashboard(dashboardResponse.data)
    setTemplates(templatesResponse.data)
    setDocuments(documentsResponse.data)
    setCategories(categoriesResponse.data)
    setEmailRecipients(emailRecipientsResponse.data)
    setEmailTemplates(emailTemplatesResponse.data)
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        await refreshData()
      } catch (error) {
        console.error('Unable to load DocuFill data', error)
        setNotice(
          error.message || 'Data tidak dapat dimuat. Periksa koneksi ke server lalu muat ulang halaman.',
        )
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const stats = useMemo(
    () => [
      {
        label: 'Total template',
        value: dashboard.total_templates,
        icon: LayoutGrid,
        accent: 'bg-brand-50 text-brand-700',
      },
      {
        label: 'Total dokumen',
        value: dashboard.total_documents,
        icon: FileText,
        accent: 'bg-sky-50 text-sky-700',
      },
      {
        label: 'Kategori',
        value: dashboard.total_categories,
        icon: FolderKanban,
        accent: 'bg-violet-50 text-violet-700',
      },
      {
        label: 'Dokumen terbaru',
        value: dashboard.latest_documents?.length || 0,
        icon: CircleDollarSign,
        accent: 'bg-emerald-50 text-emerald-700',
      },
    ],
    [dashboard],
  )

  const navigate = (item) => {
    setActiveSection(item.target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveWallpaper = (nextWallpaper) => {
    try {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify(nextWallpaper))
      setWallpaper(nextWallpaper)
      setDialog(null)
      setNotice('Wallpaper berhasil diperbarui di browser ini.')
    } catch (error) {
      console.error('Unable to save wallpaper preference', error)
      setNotice('Wallpaper tidak dapat disimpan. Coba gambar yang lebih kecil atau pilihan lain.')
    }
  }

  const uploadWallpaper = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotice('Pilih gambar JPG, PNG, atau WebP.')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setNotice('Ukuran gambar wallpaper maksimal 12 MB.')
      return
    }

    setWallpaperBusy(true)
    let bitmap
    try {
      bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 1920 / bitmap.width, 1200 / bitmap.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Browser tidak dapat memproses gambar wallpaper.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

      let value = canvas.toDataURL('image/jpeg', 0.78)
      if (value.length > 3_500_000) {
        value = canvas.toDataURL('image/jpeg', 0.62)
      }
      if (value.length > 3_500_000) {
        throw new Error('Gambar masih terlalu besar setelah dikompres. Pilih gambar yang lebih kecil.')
      }
      saveWallpaper({ type: 'image', value })
    } catch (error) {
      console.error('Unable to process wallpaper image', error)
      setNotice(error.message || 'Gambar wallpaper tidak dapat diproses.')
    } finally {
      bitmap?.close()
      setWallpaperBusy(false)
    }
  }

  const activeWallpaper =
    wallpaper.type === 'image'
      ? {
          backgroundColor: '#e2e8f0',
          backgroundImage: `linear-gradient(rgba(248, 250, 252, 0.76), rgba(248, 250, 252, 0.76)), url("${wallpaper.value}")`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
          backgroundAttachment: 'fixed',
        }
      : {
          background:
            wallpaperPresets.find((preset) => preset.id === wallpaper.value)?.background ||
            wallpaperPresets[0].background,
          backgroundAttachment: 'fixed',
        }

  const openNewDocument = (template = spreadsheetTemplates[0]) => {
    if (!template) {
      setNotice('Unggah template Excel (.xlsx) terlebih dahulu untuk mulai mengisi dokumen.')
      setDialog('upload-template')
      return
    }

    setFormTemplateId(String(template.id))
    setDocumentMode('create')
    setEditingDocumentId(null)
    setDocumentName('')
    setPurpose('')
    setApplicantName('')
    setApplicationDate(getTodayDateInput())
    setFolderName('')
    setEvidencePhotos([])
    setTemplateAnalysis(null)
    setAnalysisError('')
    setFormFields({})
    setCustomFields([])
    setItemRows([{}])
    setDialog('new-document')
  }

  const openTemplateFieldEditor = async (template) => {
    setEditingTemplateId(template.id)
    setTemplateCustomFields(template.custom_fields || [])
    setTemplateFieldAnalysis(null)
    setTemplateAnalysisError('')
    setDialog('edit-template-fields')
    try {
      const { data } = await axios.get(`${API_URL}/templates/${template.id}/analysis`)
      setTemplateFieldAnalysis(data)
      setTemplateCustomFields(data.custom_fields || [])
    } catch (error) {
      console.error('Unable to load template form settings', error)
      setTemplateAnalysisError(
        error.response?.data?.detail || 'Pengaturan form template tidak dapat dimuat.',
      )
    }
  }

  const saveTemplateFields = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await axios.patch(`${API_URL}/templates/${editingTemplateId}`, {
        custom_fields: templateCustomFields,
      })
      await refreshData()
      setDialog(null)
      setNotice('Pengaturan form template berhasil disimpan.')
    } catch (error) {
      console.error('Unable to save template form settings', error)
      setTemplateAnalysisError(
        error.response?.data?.detail || 'Pengaturan form template gagal disimpan.',
      )
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (dialog !== 'new-document' || !formTemplateId || documentMode !== 'create') {
      return undefined
    }

    let active = true
    axios
      .get(`${API_URL}/templates/${formTemplateId}/analysis`)
      .then(({ data }) => {
        if (!active) return
        setTemplateAnalysis(data)
        setFormFields(
          Object.fromEntries(
            data.fields.map((field) => [
              field.key,
              getSubmissionFieldType(field.label) === 'applicationDate' ? getTodayDateInput() : '',
            ]),
          ),
        )
        setCustomFields(
          (data.custom_fields || []).map((field) => ({
            ...field,
            value:
              getSubmissionFieldType(field.label) === 'applicationDate'
                ? getTodayDateInput()
                : '',
          })),
        )
        setItemRows([{}])
      })
      .catch((error) => {
        if (!active) return
        console.error('Unable to analyze spreadsheet template', error)
        setAnalysisError(
          error.response?.data?.detail || 'Template Excel tidak dapat dianalisis.',
        )
      })

    return () => {
      active = false
    }
  }, [dialog, formTemplateId, documentMode])

  const exportReport = () => {
    const rows = [
      ['Nama', 'Kategori', 'Template', 'Status', 'Dibuat oleh', 'Tanggal'],
      ...documents.map((document) => [
        document.name,
        document.category || '',
        document.template_name || '',
        document.status || '',
        document.created_by || '',
        document.created_at || '',
      ]),
    ]
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'docufill-documents.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const generateDocument = async (event) => {
    event.preventDefault()
    if (!templateAnalysis) {
      setNotice('Analisis template belum selesai.')
      return
    }

    let submissionData
    let outputName = documentName
    if (documentMode === 'create') {
      const trimmedFolderName = folderName.trim()
      if (!trimmedFolderName) {
        setNotice('Isi nama folder dokumen terlebih dahulu.')
        return
      }
      if (
        trimmedFolderName.length > 120 ||
        /[/\\<>:"|?*]/.test(trimmedFolderName) ||
        Array.from(trimmedFolderName).some((character) => character.charCodeAt(0) < 32) ||
        /[. ]$/.test(trimmedFolderName) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(trimmedFolderName) ||
        ['.', '..'].includes(trimmedFolderName)
      ) {
        setNotice('Nama folder berisi karakter yang tidak diizinkan.')
        return
      }
      if (evidencePhotos.length > 10) {
        setNotice('Maksimal 10 foto untuk setiap folder.')
        return
      }
      if (evidencePhotos.some((photo) => photo.size > 8 * 1024 * 1024)) {
        setNotice('Ukuran setiap foto maksimal 8 MB.')
        return
      }
      if (evidencePhotos.reduce((total, photo) => total + photo.size, 0) > 30 * 1024 * 1024) {
        setNotice('Total ukuran foto maksimal 30 MB.')
        return
      }

      submissionData = {
        purpose: String(getCurrentSubmissionValue('purpose') || '').trim(),
        applicantName: String(getCurrentSubmissionValue('applicantName') || '').trim(),
        applicationDate: String(getCurrentSubmissionValue('applicationDate') || '').trim(),
      }
      if (
        !submissionData.purpose ||
        !submissionData.applicantName ||
        !submissionData.applicationDate
      ) {
        setNotice('Isi tujuan pengajuan, nama pemohon, dan tanggal pengajuan terlebih dahulu.')
        return
      }
      outputName = buildSubmissionName(submissionData)
    }

    const items = itemRows.filter((item) =>
      Object.values(item).some((value) => String(value || '').trim()),
    )
    if (!items.length) {
      setNotice('Isi setidaknya satu baris item sebelum membuat dokumen.')
      return
    }

    const selectedTemplate = spreadsheetTemplates.find(
      (template) => String(template.id) === formTemplateId,
    )
    const payload = {
      template_id: formTemplateId ? Number(formTemplateId) : undefined,
      name: outputName,
      category: selectedTemplate?.category_name || '',
      fields: formFields,
      custom_fields: customFields,
      items,
    }
    if (submissionData) {
      payload.purpose = submissionData.purpose
      payload.applicant_name = submissionData.applicantName
      payload.application_date = submissionData.applicationDate
      for (const [key, value] of Object.entries(submissionData)) {
        const mappedField = submissionFields[key]
        if (!mappedField) continue
        if (templateAnalysis.fields.some((field) => field.key === mappedField.key)) {
          payload.fields[mappedField.key] = value
        } else {
          payload.custom_fields = payload.custom_fields.map((field) =>
            field.key === mappedField.key ? { ...field, value } : field,
          )
        }
      }
    }

    setSaving(true)
    try {
      let generatedDocument
      if (documentMode === 'edit') {
        generatedDocument = await axios.put(
          `${API_URL}/documents/${editingDocumentId}`,
          payload,
        )
      } else if (documentMode === 'copy') {
        generatedDocument = await axios.post(
          `${API_URL}/documents/${editingDocumentId}/copy`,
          payload,
        )
      } else {
        const formData = new FormData()
        formData.append('payload', JSON.stringify(payload))
        formData.append('folder_name', folderName.trim())
        evidencePhotos.forEach((photo) => formData.append('photos', photo))
        generatedDocument = await axios.post(
          `${API_URL}/documents/generate-folder`,
          formData,
        )
      }
      await refreshData()
      if (documentMode === 'create') {
        const { data: preview } = await axios.get(
          `${API_URL}/documents/${generatedDocument.data.id}/folder-preview`,
        )
        setFolderPreview(preview)
        setFolderWorkflowStep('review')
        setFolderWorkflowError('')
        setSelectedEmailRecipients([])
        setSelectedEmailTemplateId('')
        setEmailSubject('')
        setEmailBody('')
        setDialog('folder-workflow')
        setNotice(`Folder "${preview.folder_name}" dibuat. Periksa Excel dan foto sebelum melanjutkan.`)
      } else {
        setDialog(null)
        setNotice(
          documentMode === 'edit'
            ? 'Dokumen berhasil diperbarui.'
            : 'Salinan dokumen berhasil dibuat.',
        )
      }
    } catch (error) {
      console.error('Unable to generate document', error)
      setNotice(error.response?.data?.detail || 'Dokumen gagal dibuat. Silakan coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  const uploadTemplate = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSaving(true)
    try {
      await axios.post(`${API_URL}/templates`, formData)
      await refreshData()
      setDialog(null)
      setNotice('Template berhasil diunggah.')
    } catch (error) {
      console.error('Unable to upload template', error)
      setNotice(error.response?.data?.detail || 'Template gagal diunggah. Silakan coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  const updateItemValue = (rowIndex, key, value) => {
    setItemRows((currentRows) =>
      currentRows.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row)),
    )
  }

  const openStoredDocument = async (item, mode) => {
    setOpeningDocumentId(item.id)
    try {
      const { data } = await axios.get(`${API_URL}/documents/${item.id}/form`)
      setFormTemplateId(data.template_id ? String(data.template_id) : '')
      setDocumentMode(mode)
      setEditingDocumentId(item.id)
      setDocumentName(mode === 'copy' ? `${data.name} - Salinan` : data.name)
      setTemplateAnalysis({ ...data.analysis, template_name: data.template_name })
      setAnalysisError('')
      setFormFields(data.fields)
      setCustomFields(data.custom_fields || [])
      setItemRows(data.items.length ? data.items : [{}])
      setDialog('new-document')
    } catch (error) {
      console.error(`Unable to ${mode} generated document`, error)
      setNotice(
        error.response?.data?.detail || 'Data form dokumen tidak dapat dibuka untuk diedit.',
      )
    } finally {
      setOpeningDocumentId(null)
    }
  }

  const deleteTemplate = async (template) => {
    const confirmed = window.confirm(
      `Hapus template "${template.name}"? Dokumen yang sudah dibuat tidak akan dihapus.`,
    )
    if (!confirmed) return

    setDeletingTemplateId(template.id)
    try {
      await axios.delete(`${API_URL}/templates/${template.id}`)
      setTemplates((currentTemplates) =>
        currentTemplates.filter((item) => item.id !== template.id),
      )
      setDashboard((currentDashboard) => ({
        ...currentDashboard,
        total_templates: Math.max(0, currentDashboard.total_templates - 1),
      }))
      setNotice(`Template "${template.name}" berhasil dihapus.`)
    } catch (error) {
      console.error('Unable to delete template', error)
      setNotice(error.response?.data?.detail || 'Template gagal dihapus. Silakan coba lagi.')
    } finally {
      setDeletingTemplateId(null)
    }
  }

  const deleteDocument = async (item) => {
    const confirmed = window.confirm(`Hapus dokumen "${item.name}"?`)
    if (!confirmed) return

    setDeletingDocumentId(item.id)
    try {
      await axios.delete(`${API_URL}/documents/${item.id}`)
      setDocuments((currentDocuments) =>
        currentDocuments.filter((document) => document.id !== item.id),
      )
      setDashboard((currentDashboard) => ({
        ...currentDashboard,
        total_documents: Math.max(0, currentDashboard.total_documents - 1),
        latest_documents: currentDashboard.latest_documents.filter(
          (document) => document.id !== item.id,
        ),
      }))
      setNotice(`Dokumen "${item.name}" berhasil dihapus.`)
    } catch (error) {
      console.error('Unable to delete document', error)
      setNotice(error.response?.data?.detail || 'Dokumen gagal dihapus. Silakan coba lagi.')
    } finally {
      setDeletingDocumentId(null)
    }
  }

  const downloadDocument = (item) => {
    if (item.folder_name) {
      window.open(
        `${API_URL}/documents/${item.id}/download-folder`,
        '_blank',
        'noopener,noreferrer',
      )
      return
    }
    const fileName = item.file_path?.match(/^\/api\/files\/(.+)$/)?.[1]
    if (!fileName) {
      setNotice('File untuk dokumen ini tidak tersedia untuk diunduh.')
      return
    }
    window.open(`${API_URL}/files/${encodeURIComponent(fileName)}`, '_blank', 'noopener,noreferrer')
  }

  const openFolderReview = async (item) => {
    setOpeningDocumentId(item.id)
    try {
      const { data } = await axios.get(`${API_URL}/documents/${item.id}/folder-preview`)
      setFolderPreview(data)
      setFolderWorkflowStep('review')
      setFolderWorkflowError('')
      setSelectedEmailRecipients([])
      setSelectedEmailTemplateId('')
      setEmailSubject('')
      setEmailBody('')
      setDialog('folder-workflow')
    } catch (error) {
      console.error('Unable to preview document folder', error)
      setNotice(error.response?.data?.detail || 'Isi folder tidak dapat dimuat.')
    } finally {
      setOpeningDocumentId(null)
    }
  }

  const downloadFolderZip = async () => {
    if (!folderPreview) return
    setFolderZipBusy(true)
    setFolderWorkflowError('')
    try {
      const { data } = await axios.get(
        `${API_URL}/documents/${folderPreview.id}/download-folder`,
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `${folderPreview.folder_name}.zip`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`ZIP folder "${folderPreview.folder_name}" berhasil diunduh.`)
    } catch (error) {
      console.error('Unable to download document folder', error)
      setFolderWorkflowError(error.response?.data?.detail || 'ZIP folder tidak dapat dibuat.')
    } finally {
      setFolderZipBusy(false)
    }
  }

  const openFolderEmailDraft = (event) => {
    event.preventDefault()
    if (!folderPreview || !selectedEmailRecipients.length) {
      setFolderWorkflowError('Pilih setidaknya satu alamat email penerima.')
      return
    }
    const recipient = selectedEmailRecipients.map((email) => encodeURIComponent(email)).join(',')
    const mailtoUrl =
      `mailto:${recipient}?subject=${encodeURIComponent(emailSubject.trim())}` +
      `&body=${encodeURIComponent(emailBody.trim())}`
    if (mailtoUrl.length > 8000) {
      setFolderWorkflowError('Isi email terlalu panjang untuk dibuka di aplikasi email. Persingkat pesannya.')
      return
    }
    window.location.href = mailtoUrl
    setDialog(null)
    setNotice(
      `Aplikasi email dibuka untuk folder "${folderPreview.folder_name}". Lampirkan ZIP hasil unduhan sebelum mengirim.`,
    )
  }

  const selectEmailTemplate = (templateId) => {
    const selected = emailTemplates.find((template) => String(template.id) === templateId)
    setSelectedEmailTemplateId(templateId)
    setSelectedEmailRecipients(selected?.recipients || [])
    let subject = selected?.subject || ''
    if (selected && folderPreview?.document_name) {
      subject = subject.includes('{document_name}')
        ? subject.replaceAll('{document_name}', folderPreview.document_name)
        : subject.includes(folderPreview.document_name)
          ? subject
          : `${subject.trim()} - ${folderPreview.document_name}`
    }
    setEmailSubject(subject)
    setEmailBody(selected?.body || '')
  }

  const continueToEmail = () => {
    setFolderWorkflowStep('email')
    setEmailSubject((current) => current.trim() || folderPreview?.document_name || '')
  }

  const addEmailRecipient = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await axios.post(`${API_URL}/email/recipients`, { email: newRecipientEmail })
      setNewRecipientEmail('')
      await refreshData()
      setNotice('Alamat email berhasil ditambahkan.')
    } catch (error) {
      console.error('Unable to save email recipient', error)
      setNotice(error.response?.data?.detail || 'Alamat email gagal ditambahkan.')
    } finally {
      setSaving(false)
    }
  }

  const deleteEmailRecipient = async (recipient) => {
    if (!window.confirm(`Hapus alamat email "${recipient.email}" dari pilihan?`)) return
    try {
      await axios.delete(`${API_URL}/email/recipients/${recipient.id}`)
      setSelectedEmailRecipients((current) =>
        current.filter((email) => email !== recipient.email),
      )
      setEmailTemplateForm((current) => ({
        ...current,
        recipients: current.recipients.filter((email) => email !== recipient.email),
      }))
      await refreshData()
      setNotice('Alamat email berhasil dihapus.')
    } catch (error) {
      console.error('Unable to delete email recipient', error)
      setNotice(error.response?.data?.detail || 'Alamat email gagal dihapus.')
    }
  }

  const openEmailTemplateForm = (template = null) => {
    setEditingEmailTemplateId(template?.id || null)
    setEmailTemplateForm({
      name: template?.name || '',
      recipients: template?.recipients || [],
      subject: template?.subject || '{document_name}',
      body: template?.body || '',
    })
    setDialog('email-template')
  }

  const saveEmailTemplate = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      if (editingEmailTemplateId) {
        await axios.put(
          `${API_URL}/email/templates/${editingEmailTemplateId}`,
          emailTemplateForm,
        )
      } else {
        await axios.post(`${API_URL}/email/templates`, emailTemplateForm)
      }
      await refreshData()
      setDialog(null)
      setNotice('Template email berhasil disimpan.')
    } catch (error) {
      console.error('Unable to save email template', error)
      setNotice(error.response?.data?.detail || 'Template email gagal disimpan.')
    } finally {
      setSaving(false)
    }
  }

  const deleteEmailTemplate = async (template) => {
    if (!window.confirm(`Hapus template email "${template.name}"?`)) return
    try {
      await axios.delete(`${API_URL}/email/templates/${template.id}`)
      await refreshData()
      setNotice('Template email berhasil dihapus.')
    } catch (error) {
      console.error('Unable to delete email template', error)
      setNotice(error.response?.data?.detail || 'Template email gagal dihapus.')
    }
  }

  return (
    <div className="min-h-screen text-slate-800" style={activeWallpaper}>
      <div className="flex min-h-screen">
        <aside className="hidden w-72 flex-col justify-between bg-slate-950 p-6 text-slate-100 lg:flex">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold">
                D
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Internal</p>
                <h1 className="text-xl font-semibold">DocuFill</h1>
              </div>
            </div>

            <nav className="space-y-2" aria-label="Main navigation">
              {navigation.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item)}
                  aria-current={activeSection === item.target ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    activeSection === item.target
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800/80'
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <p className="text-xs text-slate-500">Personal workspace</p>
        </aside>

        <main className="flex-1 p-4 md:p-8">
          <header className="mb-8 border-b border-slate-200 pb-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                  DocuFill
                </p>
                <h2 className="mt-2 text-3xl font-bold text-slate-900">
                  {pageTitles[activeSection]}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDialog('wallpaper')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300"
                >
                  <Image size={16} />
                  Wallpaper
                </button>
                {['documents', 'all-documents'].includes(activeSection) && (
                  <button
                    type="button"
                    onClick={exportReport}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300"
                  >
                    Export report
                  </button>
                )}
                {activeSection === 'documents' && (
                  <button
                    type="button"
                    onClick={() => openNewDocument()}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"
                  >
                    <Plus size={16} />
                    Buat folder
                  </button>
                )}
                {activeSection === 'templates' && (
                  <button
                    type="button"
                    onClick={() => setDialog('upload-template')}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"
                  >
                    <Plus size={16} />
                    New template
                  </button>
                )}
                {activeSection === 'email-templates' && (
                  <button
                    type="button"
                    onClick={() => openEmailTemplateForm()}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"
                  >
                    <Plus size={16} />
                    Template email
                  </button>
                )}
              </div>
            </div>
            <nav
              className="mt-5 flex gap-2 overflow-x-auto lg:hidden"
              aria-label="Main navigation"
            >
              {navigation.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item)}
                  aria-current={activeSection === item.target ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium shadow-sm ${
                    activeSection === item.target
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </header>

          {notice && (
            <div
              role="status"
              className="mb-6 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
            >
              {notice}
              <button type="button" onClick={() => setNotice('')} aria-label="Tutup pemberitahuan">
                <X size={18} />
              </button>
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-card">
              Loading…
            </div>
          ) : activeSection === 'dashboard' ? (
            <section className="space-y-8">
              <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {stats.map(({ label, value, icon: Icon, accent }) => (
                  <div key={label} className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100">
                    <div className="mb-4 flex items-center justify-between">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
                        <Icon size={18} />
                      </div>
                      <ArrowUpRight className="text-slate-400" size={16} />
                    </div>
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
                  </div>
                ))}
              </section>
            </section>
          ) : activeSection === 'templates' ? (
            <section className="card">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                      Template library
                    </p>
                    <h3 className="text-xl font-semibold text-slate-900">Managed templates</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Unggah .xlsx untuk membaca kolom otomatis dan membuat form dokumen.
                    </p>
                  </div>
                </div>

                {!templates.length && (
                  <p className="text-sm text-slate-500">
                    Belum ada template. Unggah file Excel untuk mulai.
                  </p>
                )}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {templates.map((template) => (
                    <div key={template.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-brand-700">
                          {template.status}
                        </span>
                        <span className="text-xs font-medium text-slate-500">v{template.version}</span>
                      </div>
                      <h4 className="text-base font-semibold text-slate-900">{template.name}</h4>
                      <p className="mt-2 text-sm text-slate-600">
                        {template.description || 'Document template ready for form mapping.'}
                      </p>
                      <div className="mt-4 space-y-3 text-xs text-slate-500">
                        <div className="flex items-center justify-between">
                          <span>{template.category_name || 'Finance'}</span>
                          {template.file_name?.toLowerCase().endsWith('.xlsx') ? (
                            <button
                              type="button"
                              onClick={() => openNewDocument(template)}
                              className="font-medium text-brand-700"
                            >
                              Use
                            </button>
                          ) : (
                            <span className="text-slate-400">Excel diperlukan untuk form otomatis</span>
                          )}
                        </div>
                        <p className="flex items-center gap-1.5">
                          <CalendarDays size={14} />
                          {formatDate(template.created_at)}
                        </p>
                        {template.file_name?.toLowerCase().endsWith('.xlsx') && (
                          <button
                            type="button"
                            onClick={() => openTemplateFieldEditor(template)}
                            className="inline-flex items-center gap-1.5 font-medium text-brand-700"
                          >
                            <Pencil size={14} />
                            Edit form template
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={deletingTemplateId === template.id}
                          onClick={() => deleteTemplate(template)}
                          className="inline-flex items-center gap-1.5 font-medium text-red-700 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          {deletingTemplateId === template.id ? 'Deleting…' : 'Delete template'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
          ) : activeSection === 'documents' ? (
            <section className="card">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                    Documents
                  </p>
                  <h3 className="text-xl font-semibold text-slate-900">
                    Dokumen terbaru
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(navigation.find((item) => item.target === 'all-documents'))}
                  className="text-sm font-medium text-brand-700"
                >
                  Lihat semua
                </button>
              </div>
              <DocumentTable
                documents={dashboard.latest_documents || []}
                onDownload={downloadDocument}
                onDelete={deleteDocument}
                onEdit={(item) => openStoredDocument(item, 'edit')}
                onCopy={(item) => openStoredDocument(item, 'copy')}
                onPreviewFolder={openFolderReview}
                deletingDocumentId={deletingDocumentId}
                openingDocumentId={openingDocumentId}
              />
            </section>
          ) : activeSection === 'email-templates' ? (
            <section className="space-y-6">
              <section className="card">
                <div className="mb-5">
                  <h3 className="text-xl font-semibold text-slate-900">Alamat penerima</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Simpan alamat yang sering digunakan. Alamat dapat dipilih saat mengirim folder.
                  </p>
                </div>
                <form onSubmit={addEmailRecipient} className="mb-5 flex flex-wrap gap-3">
                  <input
                    type="email"
                    required
                    maxLength={320}
                    value={newRecipientEmail}
                    onChange={(event) => setNewRecipientEmail(event.target.value)}
                    placeholder="nama@contoh.com"
                    className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Tambah alamat
                  </button>
                </form>
                {emailRecipients.length ? (
                  <ul className="divide-y divide-slate-100">
                    {emailRecipients.map((recipient) => (
                      <li
                        key={recipient.id}
                        className="flex items-center justify-between gap-3 py-3 text-sm"
                      >
                        <span className="break-all text-slate-700">{recipient.email}</span>
                        <button
                          type="button"
                          onClick={() => deleteEmailRecipient(recipient)}
                          className="inline-flex shrink-0 items-center gap-1 text-red-700"
                        >
                          <Trash2 size={14} />
                          Hapus
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Belum ada alamat penerima tersimpan.</p>
                )}
              </section>

              <section className="card">
                <div className="mb-5">
                  <h3 className="text-xl font-semibold text-slate-900">Template email</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Template menyimpan penerima, subjek, dan isi email. Semua isian tetap bisa diedit sebelum dikirim.
                  </p>
                </div>
                {emailTemplates.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {emailTemplates.map((template) => (
                      <article
                        key={template.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <h4 className="font-semibold text-slate-900">{template.name}</h4>
                        <p className="mt-2 text-xs text-slate-500">
                          Kepada: {template.recipients.join(', ')}
                        </p>
                        <p className="mt-2 text-sm font-medium text-slate-700">
                          Subjek: {template.subject}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                          {template.body}
                        </p>
                        <div className="mt-4 flex gap-4 text-sm">
                          <button
                            type="button"
                            onClick={() => openEmailTemplateForm(template)}
                            className="inline-flex items-center gap-1.5 font-medium text-brand-700"
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEmailTemplate(template)}
                            className="inline-flex items-center gap-1.5 font-medium text-red-700"
                          >
                            <Trash2 size={14} />
                            Hapus
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Belum ada template email.</p>
                )}
              </section>
            </section>
          ) : (
            <section className="card">
                <h3 className="mb-4 text-xl font-semibold text-slate-900">All documents</h3>
                <DocumentTable
                  documents={documents}
                  onDownload={downloadDocument}
                  onDelete={deleteDocument}
                  onEdit={(item) => openStoredDocument(item, 'edit')}
                  onCopy={(item) => openStoredDocument(item, 'copy')}
                  onPreviewFolder={openFolderReview}
                  deletingDocumentId={deletingDocumentId}
                  openingDocumentId={openingDocumentId}
                />
              </section>
          )}
        </main>
      </div>

      {dialog === 'new-document' && (
        <Modal
          title={
            documentMode === 'edit'
              ? 'Edit dokumen'
              : documentMode === 'copy'
                ? 'Salin dokumen'
                : 'Isi dokumen dari template'
          }
          onClose={() => setDialog(null)}
          wide
        >
          <form onSubmit={generateDocument} className="space-y-4">
            {documentMode === 'create' ? (
              <label className="block text-sm font-medium text-slate-700">
                Template Excel
                <select
                  value={formTemplateId}
                  required
                  onChange={(event) => {
                    const template = spreadsheetTemplates.find(
                      (item) => String(item.id) === event.target.value,
                    )
                    if (template) openNewDocument(template)
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {spreadsheetTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-slate-600">
                Template: <strong>{templateAnalysis?.template_name || 'Dokumen tersimpan'}</strong>
              </p>
            )}
            {documentMode !== 'create' && (
              <label className="block text-sm font-medium text-slate-700">
                Nama dokumen hasil
                <input
                  name="document_name"
                  value={documentName}
                  onChange={(event) => setDocumentName(event.target.value)}
                  placeholder="Contoh: Reimbursement November"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            )}
            {documentMode === 'create' && (
              <section className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                <div>
                  <h3 className="font-semibold text-slate-900">Folder dokumen</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Folder disimpan di DocuFill, bukan di perangkat ini. Setelah dibuat, unduh
                    sebagai ZIP berisi file Excel dan foto dokumentasi.
                  </p>
                </div>
                {Object.entries({
                  purpose: ['Tujuan pengajuan', purpose, setPurpose],
                  applicantName: ['Nama pemohon', applicantName, setApplicantName],
                  applicationDate: ['Tanggal pengajuan', applicationDate, setApplicationDate],
                })
                  .filter(([kind]) => !submissionFields[kind])
                  .map(([kind, [label, value, setValue]]) => (
                    <label
                      key={kind}
                      className="block text-sm font-medium text-slate-700"
                    >
                      {label}
                      <input
                        type={kind === 'applicationDate' ? 'date' : 'text'}
                        required
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                  ))}
                <label className="block text-sm font-medium text-slate-700">
                  Nama folder
                  <input
                    required
                    maxLength={120}
                    value={folderName}
                    onChange={(event) => setFolderName(event.target.value)}
                    placeholder="Contoh: Pengajuan Reyval November"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Foto dokumentasi / realisasi (opsional)
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) =>
                      setEvidencePhotos(Array.from(event.target.files || []))
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    {evidencePhotos.length
                      ? `${evidencePhotos.length} foto dipilih`
                      : 'Maksimal 10 foto, 8 MB per foto dan total 30 MB. Foto tersimpan di DocuFill.'}
                  </span>
                </label>
                <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                  Nama Excel: <strong>{buildSubmissionName({
                    purpose: getCurrentSubmissionValue('purpose'),
                    applicantName: getCurrentSubmissionValue('applicantName'),
                    applicationDate: getCurrentSubmissionValue('applicationDate'),
                  })}.xlsx</strong>
                </p>
              </section>
            )}
            {analysisError && <p role="alert" className="text-sm text-red-700">{analysisError}</p>}
            {!templateAnalysis && !analysisError && (
              <p className="text-sm text-slate-500">Sedang membaca struktur template Excel…</p>
            )}
            {templateAnalysis && (
              <>
                <p className="text-sm text-slate-600">
                  Sheet <strong>{templateAnalysis.sheet_name}</strong>. Isi informasi dasar dan
                  tambahkan baris item sesuai kebutuhan.
                </p>
                {templateAnalysis.diagnostics.map((diagnostic) => (
                  <p
                    key={diagnostic}
                    role="status"
                    className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  >
                    {diagnostic}
                  </p>
                ))}
                {templateAnalysis.fields.length > 0 && (
                  <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-semibold text-slate-900">Informasi dokumen</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {templateAnalysis.fields.map((field) => (
                        <label key={field.key} className="block text-sm font-medium text-slate-700">
                          {field.label}
                          <input
                            type={field.input_type || 'text'}
                            required={
                              documentMode === 'create' &&
                              Boolean(getSubmissionFieldType(field.label))
                            }
                            value={formFields[field.key] || ''}
                            onChange={(event) =>
                              setFormFields((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                )}
                {customFields.length > 0 && (
                  <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">Informasi tambahan</h3>
                      <p className="text-xs text-slate-500">
                        Isian ini sudah diatur di template. Ubah daftar atau selnya dari halaman
                        Templates.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {customFields.map((field, index) => (
                        <label key={field.key} className="block text-sm font-medium text-slate-700">
                          {field.label}
                          <input
                            type={field.input_type || 'text'}
                            step={field.input_type === 'number' ? 'any' : undefined}
                            required={
                              documentMode === 'create' &&
                              Boolean(getSubmissionFieldType(field.label))
                            }
                            value={field.value || ''}
                            onChange={(event) =>
                              setCustomFields((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, value: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                )}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">Rincian item</h3>
                    <button
                      type="button"
                      disabled={
                        templateAnalysis.max_items != null &&
                        itemRows.length >= templateAnalysis.max_items
                      }
                      onClick={() =>
                        setItemRows((current) => [...current, {}])
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus size={15} />
                      Tambah item
                    </button>
                  </div>
                  {templateAnalysis.max_items != null && (
                    <p className="text-xs text-slate-500">
                      Maksimal {templateAnalysis.max_items} baris sesuai ruang pada template.
                    </p>
                  )}
                  {templateAnalysis.headers.some((header) => header.input_type === 'sequence') && (
                    <p className="text-xs text-slate-500">
                      Nomor rincian akan diisi otomatis.
                    </p>
                  )}
                  {templateAnalysis.headers.some(
                    (header) => !header.editable && header.input_type !== 'sequence',
                  ) && (
                    <p className="text-xs text-slate-500">
                      Kolom dengan rumus pada template akan dihitung otomatis.
                    </p>
                  )}
                  {itemRows.map((item, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700">Item {rowIndex + 1}</p>
                        {itemRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setItemRows((current) =>
                                current.filter((_, index) => index !== rowIndex),
                              )
                            }
                            className="text-xs font-medium text-red-700"
                          >
                            Hapus item
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {templateAnalysis.headers
                          .filter((header) => header.editable)
                          .map((header) => (
                            <label
                              key={header.key}
                              className="block text-sm font-medium text-slate-700"
                            >
                              {header.label}
                              {header.options?.length ? (
                                <select
                                  value={item[header.key] || ''}
                                  onChange={(event) =>
                                    updateItemValue(rowIndex, header.key, event.target.value)
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                >
                                  <option value="">Pilih {header.label}</option>
                                  {item[header.key] &&
                                    !header.options.includes(item[header.key]) && (
                                      <option value={item[header.key]}>{item[header.key]}</option>
                                    )}
                                  {header.options.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={header.input_type || 'text'}
                                  step={header.input_type === 'number' ? 'any' : undefined}
                                  value={item[header.key] || ''}
                                  onChange={(event) =>
                                    updateItemValue(rowIndex, header.key, event.target.value)
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                />
                              )}
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}
            <ModalActions
              onCancel={() => setDialog(null)}
              saving={saving}
              submitLabel={
                documentMode === 'edit' ? 'Simpan perubahan' : documentMode === 'copy' ? 'Buat salinan' : 'Generate'
              }
            />
          </form>
        </Modal>
      )}

      {dialog === 'folder-workflow' && folderPreview && (
        <Modal
          title={folderWorkflowStep === 'review' ? 'Periksa isi folder' : 'Kirim folder lewat email'}
          onClose={() => setDialog(null)}
          wide
        >
          {folderWorkflowStep === 'review' ? (
            <div className="space-y-5">
              <div className="rounded-xl bg-brand-50 p-4">
                <p className="text-sm text-slate-600">Folder</p>
                <h3 className="text-lg font-semibold text-slate-900">{folderPreview.folder_name}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Dokumen: {folderPreview.document_name} · Template: {folderPreview.template_name} · Sheet: {folderPreview.sheet_name}
                </p>
                <a
                  href={apiAssetUrl(folderPreview.excel_url)}
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={15} />
                  Unduh / buka Excel
                </a>
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold text-slate-900">Isi Excel</h3>
                {folderPreview.fields.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {folderPreview.fields.map((field) => (
                      <div key={field.key} className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">{field.label}</p>
                        <p className="mt-1 break-words text-sm text-slate-800">{field.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
                {folderPreview.custom_fields.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {folderPreview.custom_fields.map((field) => (
                      <div key={field.key} className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">{field.label}</p>
                        <p className="mt-1 break-words text-sm text-slate-800">{field.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
                {folderPreview.headers.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          {folderPreview.headers.map((header) => (
                            <th key={header.key} className="px-3 py-2 font-medium">
                              {header.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {folderPreview.items.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-t border-slate-100">
                            {folderPreview.headers.map((header) => (
                              <td key={header.key} className="px-3 py-2 text-slate-700">
                                {row[header.key] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {!folderPreview.items.length && (
                          <tr>
                            <td
                              colSpan={folderPreview.headers.length}
                              className="px-3 py-4 text-center text-slate-500"
                            >
                              Tidak ada rincian item.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">Foto dokumentasi / realisasi</h3>
                  <span className="text-xs text-slate-500">{folderPreview.photos.length} foto</span>
                </div>
                {folderPreview.photos.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {folderPreview.photos.map((photo) => (
                      <figure key={photo.name} className="overflow-hidden rounded-xl border border-slate-200">
                        <a href={apiAssetUrl(photo.url)} target="_blank" rel="noreferrer">
                          <img
                            src={apiAssetUrl(photo.url)}
                            alt={photo.name}
                            className="h-48 w-full bg-slate-100 object-contain"
                          />
                        </a>
                        <figcaption className="truncate px-3 py-2 text-xs text-slate-600">
                          {photo.name}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                    Tidak ada foto di folder ini.
                  </p>
                )}
              </section>

              {folderWorkflowError && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  {folderWorkflowError}
                </p>
              )}
              <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={continueToEmail}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
                >
                  Lanjut ke email
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={openFolderEmailDraft} className="space-y-4">
              <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
                ZIP <strong>{folderPreview.folder_name}.zip</strong> belum tentu sudah diunduh.
                Unduh ZIP, lalu buka aplikasi email. Penerima, subjek, dan isi akan diisi; lampirkan
                ZIP secara manual sebelum mengirim.
              </p>
              {folderWorkflowError && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  {folderWorkflowError}
                </p>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Gunakan template email
                <select
                  value={selectedEmailTemplateId}
                  onChange={(event) => selectEmailTemplate(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">Tulis email tanpa template</option>
                  {emailTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">Kirim kepada</legend>
                {emailRecipients.length ? (
                  <div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                    {emailRecipients.map((recipient) => (
                      <label key={recipient.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedEmailRecipients.includes(recipient.email)}
                          onChange={(event) =>
                            setSelectedEmailRecipients((current) =>
                              event.target.checked
                                ? [...current, recipient.email]
                                : current.filter((email) => email !== recipient.email),
                            )
                          }
                        />
                        <span className="break-all">{recipient.email}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Belum ada alamat email tersimpan.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setDialog(null)
                        navigate(navigation.find((item) => item.target === 'email-templates'))
                      }}
                      className="font-semibold underline"
                    >
                      Kelola alamat email
                    </button>
                  </p>
                )}
              </fieldset>

              <label className="block text-sm font-medium text-slate-700">
                Subjek
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Gunakan {'{document_name}'} agar otomatis berisi tujuan, nama, dan tanggal pengajuan.
                </span>
                <input
                  required
                  maxLength={255}
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Isi email
                <textarea
                  required
                  maxLength={15000}
                  rows={7}
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Tulis pesan email di sini…"
                />
              </label>
              <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setFolderWorkflowStep('review')}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
                >
                  Kembali periksa folder
                </button>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="submit"
                    disabled={
                      !selectedEmailRecipients.length ||
                      !emailSubject.trim() ||
                      !emailBody.trim()
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Send size={15} />
                    Buka aplikasi email
                  </button>
                  <button
                    type="button"
                    disabled={folderZipBusy}
                    onClick={downloadFolderZip}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    <Download size={15} />
                    {folderZipBusy ? 'Menyiapkan ZIP…' : 'Unduh folder'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </Modal>
      )}

      {dialog === 'email-template' && (
        <Modal
          title={editingEmailTemplateId ? 'Edit template email' : 'Template email baru'}
          onClose={() => setDialog(null)}
        >
          <form onSubmit={saveEmailTemplate} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Nama template
              <input
                required
                maxLength={120}
                value={emailTemplateForm.name}
                onChange={(event) =>
                  setEmailTemplateForm((current) => ({ ...current, name: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">Penerima default</legend>
              {emailRecipients.length ? (
                <div className="grid gap-2 rounded-lg border border-slate-200 p-3">
                  {emailRecipients.map((recipient) => (
                    <label key={recipient.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={emailTemplateForm.recipients.includes(recipient.email)}
                        onChange={(event) =>
                          setEmailTemplateForm((current) => ({
                            ...current,
                            recipients: event.target.checked
                              ? [...current.recipients, recipient.email]
                              : current.recipients.filter((email) => email !== recipient.email),
                          }))
                        }
                      />
                      <span className="break-all">{recipient.email}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-amber-800">Tambahkan alamat email dari halaman Email Templates terlebih dahulu.</p>
              )}
            </fieldset>
            <label className="block text-sm font-medium text-slate-700">
              Subjek
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Token {'{document_name}'} akan diganti otomatis, misalnya Pengajuan Reimbursement - Reyval Danendra 06112026.
              </span>
              <input
                required
                maxLength={255}
                value={emailTemplateForm.subject}
                onChange={(event) =>
                  setEmailTemplateForm((current) => ({ ...current, subject: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Isi email
              <textarea
                required
                maxLength={15000}
                rows={7}
                value={emailTemplateForm.body}
                onChange={(event) =>
                  setEmailTemplateForm((current) => ({ ...current, body: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <ModalActions
              onCancel={() => setDialog(null)}
              saving={saving}
              disabled={!emailTemplateForm.recipients.length}
              submitLabel="Simpan template email"
            />
          </form>
        </Modal>
      )}

      {dialog === 'upload-template' && (
        <Modal title="Upload template" onClose={() => setDialog(null)}>
          <form onSubmit={uploadTemplate} className="space-y-4">
            <FormField name="name" label="Template name" required />
            <label className="block text-sm font-medium text-slate-700">
              Category
              <select
                name="category_id"
                required
                defaultValue={categories[0]?.id || ''}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <FormField name="description" label="Description" />
            <label className="block text-sm font-medium text-slate-700">
              Excel file (.xlsx)
              <input
                name="file"
                type="file"
                accept=".xlsx"
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <ModalActions onCancel={() => setDialog(null)} saving={saving} submitLabel="Upload" />
          </form>
        </Modal>
      )}
      {dialog === 'edit-template-fields' && (
        <Modal title="Edit form template" onClose={() => setDialog(null)} wide>
          <form onSubmit={saveTemplateFields} className="space-y-4">
            {templateAnalysisError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {templateAnalysisError}
              </p>
            )}
            {!templateFieldAnalysis && !templateAnalysisError && (
              <p className="text-sm text-slate-500">Sedang membaca struktur template Excel…</p>
            )}
            {templateFieldAnalysis && (
              <>
                <p className="text-sm text-slate-600">
                  Cocokkan pratinjau form dengan sheet{' '}
                  <strong>{templateFieldAnalysis.sheet_name}</strong>. Kalau ada bagian yang
                  belum terwakili, tambahkan field di pengaturan template di bawah. Dokumen yang
                  dibuat nanti akan memakai susunan ini.
                </p>
                <section className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">Pratinjau form dokumen</h3>
                    <p className="text-xs text-slate-600">
                      Periksa apakah informasi dan rincian ini sudah cocok dengan isi Excel.
                      Pratinjau hanya contoh, tidak menyimpan data.
                    </p>
                  </div>
                  {(templateFieldAnalysis.fields.length > 0 ||
                    templateCustomFields.length > 0) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {templateFieldAnalysis.fields.map((field) => (
                        <label
                          key={field.key}
                          className="block text-sm font-medium text-slate-700"
                        >
                          {field.label}
                          <input
                            type={field.input_type || 'text'}
                            disabled
                            placeholder={`Contoh isian (${field.input_cell})`}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-100"
                          />
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            Terdeteksi dari sel {field.input_cell}
                          </span>
                        </label>
                      ))}
                      {templateCustomFields.map((field) => (
                        <label
                          key={field.key}
                          className="block text-sm font-medium text-slate-700"
                        >
                          {field.label || 'Field tambahan'}
                          <input
                            type={field.input_type || 'text'}
                            disabled
                            placeholder={
                              field.cell
                                ? `Contoh isian (${field.cell})`
                                : 'Tentukan sel Excel di pengaturan'
                            }
                            className="mt-1 w-full rounded-lg border border-brand-300 bg-white px-3 py-2 disabled:opacity-100"
                          />
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            Field tambahan{field.cell ? ` untuk sel ${field.cell}` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {templateFieldAnalysis.headers.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-800">Rincian item</h4>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {templateFieldAnalysis.headers.map((header) => (
                          <label
                            key={header.key}
                            className="block text-sm font-medium text-slate-700"
                          >
                            {header.label}
                            {header.editable && header.options?.length ? (
                              <select
                                disabled
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-100"
                              >
                                <option>
                                  {header.options[0] || `Contoh (${header.cell})`}
                                </option>
                              </select>
                            ) : (
                              <input
                                type={header.editable ? header.input_type || 'text' : 'text'}
                                disabled
                                placeholder={
                                  header.input_type === 'sequence'
                                    ? 'Nomor otomatis'
                                    : header.editable
                                      ? `Contoh isian (${header.cell})`
                                      : 'Otomatis dari template'
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-100"
                              />
                            )}
                            <span className="mt-1 block text-xs font-normal text-slate-500">
                              Kolom Excel {header.cell}
                              {!header.editable && header.input_type !== 'sequence'
                                ? ' · otomatis'
                                : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {templateFieldAnalysis.fields.length === 0 &&
                    templateCustomFields.length === 0 &&
                    templateFieldAnalysis.headers.length === 0 && (
                      <p className="text-sm text-amber-800">
                        Belum ada field yang terdeteksi. Periksa format sheet Excel.
                      </p>
                    )}
                </section>
                <div>
                  <h3 className="font-semibold text-slate-900">Field tambahan template</h3>
                  <p className="text-xs text-slate-500">
                    Tambahkan bagian yang belum terwakili. Pilih sel kosong pada sheet Excel,
                    lalu field ini akan tersedia otomatis saat mengisi dokumen.
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={templateCustomFields.length >= 40}
                    onClick={() =>
                      setTemplateCustomFields((current) => [
                        ...current,
                        {
                          key: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                          label: '',
                          cell: '',
                          input_type: 'text',
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 disabled:opacity-50"
                  >
                    <Plus size={15} />
                    Tambah isian
                  </button>
                </div>
                {templateCustomFields.map((field, index) => (
                  <div
                    key={field.key}
                    className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_0.7fr_0.7fr_auto]"
                  >
                    <label className="text-sm font-medium text-slate-700">
                      Label isian
                      <input
                        required
                        value={field.label}
                        onChange={(event) =>
                          setTemplateCustomFields((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, label: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="Contoh: Tanggal pengajuan"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Sel Excel
                      <input
                        required
                        value={field.cell}
                        onChange={(event) =>
                          setTemplateCustomFields((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, cell: event.target.value.toUpperCase() }
                                : item,
                            ),
                          )
                        }
                        placeholder="Contoh: E6"
                        maxLength={8}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Jenis
                      <select
                        value={field.input_type || 'text'}
                        onChange={(event) =>
                          setTemplateCustomFields((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, input_type: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      >
                        <option value="text">Teks</option>
                        <option value="date">Tanggal</option>
                        <option value="number">Angka</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setTemplateCustomFields((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={`Hapus ${field.label || 'isian tambahan'}`}
                      className="self-end rounded-lg px-3 py-2 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </>
            )}
            <ModalActions
              onCancel={() => setDialog(null)}
              saving={saving}
              submitLabel="Simpan form template"
              disabled={!templateFieldAnalysis}
            />
          </form>
        </Modal>
      )}
      {dialog === 'wallpaper' && (
        <Modal title="Ubah wallpaper" onClose={() => setDialog(null)}>
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Pilihan wallpaper</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {wallpaperPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => saveWallpaper({ type: 'preset', value: preset.id })}
                    aria-pressed={wallpaper.type === 'preset' && wallpaper.value === preset.id}
                    className={`overflow-hidden rounded-xl border-2 text-left transition ${
                      wallpaper.type === 'preset' && wallpaper.value === preset.id
                        ? 'border-brand-600 ring-2 ring-brand-100'
                        : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <span
                      className="block h-20"
                      style={{ background: preset.background }}
                    />
                    <span className="block px-3 py-2 text-sm font-medium text-slate-700">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-2 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-800">Gambar sendiri</h3>
              <p className="text-xs text-slate-500">
                Pilih JPG, PNG, atau WebP hingga 12 MB. Gambar diproses di browser dan disimpan hanya di browser ini.
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={wallpaperBusy}
                onChange={uploadWallpaper}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
              />
              {wallpaperBusy && (
                <p role="status" className="text-sm text-slate-500">
                  Memproses wallpaper…
                </p>
              )}
            </section>
            {wallpaper.type === 'image' && (
              <button
                type="button"
                onClick={() => saveWallpaper({ type: 'preset', value: 'plain' })}
                className="text-sm font-medium text-red-700"
              >
                Hapus gambar dan kembali ke wallpaper polos
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function formatDate(value) {
  if (!value) return 'Tanggal tidak tersedia'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia'

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function DocumentTable({
  documents,
  onDownload,
  onDelete,
  onEdit,
  onCopy,
  onPreviewFolder,
  deletingDocumentId,
  openingDocumentId,
}) {
  if (!documents.length) {
    return <p className="py-6 text-center text-sm text-slate-500">Belum ada dokumen.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="pb-3 pr-4 font-medium">Name</th>
            <th className="pb-3 pr-4 font-medium">Category</th>
            <th className="pb-3 pr-4 font-medium">Template</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
              <td className="py-3 pr-4 font-medium text-slate-800">
                {item.name}
                {item.folder_name && (
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Folder: {item.folder_name}
                  </span>
                )}
              </td>
              <td className="py-3 pr-4 text-slate-600">{item.category || 'Finance'}</td>
              <td className="py-3 pr-4 text-slate-600">{item.template_name || 'Reimbursement Form'}</td>
              <td className="py-3 pr-4">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[item.status] || statusStyles.generated}`}
                >
                  {item.status}
                </span>
              </td>
              <td className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  {item.folder_name && (
                    <button
                      type="button"
                      disabled={openingDocumentId === item.id}
                      onClick={() => onPreviewFolder(item)}
                      className="inline-flex items-center gap-1.5 text-slate-700 disabled:opacity-50"
                    >
                      <Eye size={14} />
                      Lihat folder
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDownload(item)}
                    className="inline-flex items-center gap-2 text-brand-700"
                  >
                    <Download size={14} />
                    {item.folder_name ? 'Unduh folder' : 'Download'}
                  </button>
                  {item.file_path?.toLowerCase().endsWith('.xlsx') && (
                    <>
                      <button
                        type="button"
                        disabled={openingDocumentId === item.id}
                        onClick={() => onEdit(item)}
                        className="inline-flex items-center gap-1.5 text-slate-700 disabled:opacity-50"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={openingDocumentId === item.id}
                        onClick={() => onCopy(item)}
                        className="inline-flex items-center gap-1.5 text-slate-700 disabled:opacity-50"
                      >
                        <CopyIcon size={14} />
                        Copy
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={deletingDocumentId === item.id}
                    onClick={() => onDelete(item)}
                    className="inline-flex items-center gap-1.5 text-red-700 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {deletingDocumentId === item.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`max-h-[90vh] w-full ${
          wide ? 'max-w-5xl' : 'max-w-xl'
        } overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="modal-title" className="text-xl font-semibold text-slate-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function FormField({ name, label, type = 'text', required = false }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
      />
    </label>
  )
}

function ModalActions({ onCancel, saving, submitLabel, disabled = false }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving || disabled}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {saving ? 'Please wait…' : submitLabel}
      </button>
    </div>
  )
}

export default App
