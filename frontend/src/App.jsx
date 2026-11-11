import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Download,
  FileText,
  FolderKanban,
  LayoutGrid,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || '/api'

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
]

function App() {
  const [dashboard, setDashboard] = useState(defaultDashboard)
  const [templates, setTemplates] = useState([])
  const [documents, setDocuments] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingTemplateId, setDeletingTemplateId] = useState(null)
  const [deletingDocumentId, setDeletingDocumentId] = useState(null)
  const [formTemplateId, setFormTemplateId] = useState('')
  const [templateAnalysis, setTemplateAnalysis] = useState(null)
  const [analysisError, setAnalysisError] = useState('')
  const [formFields, setFormFields] = useState({})
  const [itemRows, setItemRows] = useState([{}])

  const spreadsheetTemplates = templates.filter((template) =>
    template.file_name?.toLowerCase().endsWith('.xlsx'),
  )

  const refreshData = async () => {
    const [dashboardResponse, templatesResponse, documentsResponse, categoriesResponse] =
      await Promise.all([
        axios.get(`${API_URL}/dashboard`),
        axios.get(`${API_URL}/templates`),
        axios.get(`${API_URL}/documents`),
        axios.get(`${API_URL}/categories`),
      ])

    if (
      !dashboardResponse.data ||
      typeof dashboardResponse.data !== 'object' ||
      !Array.isArray(templatesResponse.data) ||
      !Array.isArray(documentsResponse.data) ||
      !Array.isArray(categoriesResponse.data)
    ) {
      throw new Error('API mengembalikan data dengan format yang tidak valid.')
    }

    setDashboard(dashboardResponse.data)
    setTemplates(templatesResponse.data)
    setDocuments(documentsResponse.data)
    setCategories(categoriesResponse.data)
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
    document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth' })
  }

  const openNewDocument = (template = spreadsheetTemplates[0]) => {
    if (!template) {
      setNotice('Unggah template Excel (.xlsx) terlebih dahulu untuk mulai mengisi dokumen.')
      setDialog('upload-template')
      return
    }

    setFormTemplateId(String(template.id))
    setTemplateAnalysis(null)
    setAnalysisError('')
    setFormFields({})
    setItemRows([{}])
    setDialog('new-document')
  }

  useEffect(() => {
    if (dialog !== 'new-document' || !formTemplateId) return undefined

    let active = true
    axios
      .get(`${API_URL}/templates/${formTemplateId}/analysis`)
      .then(({ data }) => {
        if (!active) return
        setTemplateAnalysis(data)
        setFormFields(Object.fromEntries(data.fields.map((field) => [field.key, ''])))
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
  }, [dialog, formTemplateId])

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

    const formData = new FormData(event.currentTarget)
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
      template_id: Number(formTemplateId),
      name: formData.get('document_name'),
      category: selectedTemplate?.category_name || '',
      fields: formFields,
      items,
    }

    setSaving(true)
    try {
      await axios.post(`${API_URL}/documents/generate`, payload)
      await refreshData()
      setDialog(null)
      setNotice('Dokumen berhasil dibuat. Unduh dari daftar dokumen.')
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
    const fileName = item.file_path?.match(/^\/api\/files\/(.+)$/)?.[1]
    if (!fileName) {
      setNotice('File untuk dokumen ini tidak tersedia untuk diunduh.')
      return
    }
    window.open(`${API_URL}/files/${encodeURIComponent(fileName)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
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
          <header id="dashboard" className="mb-8 scroll-mt-8 border-b border-slate-200 pb-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Overview</p>
                <h2 className="mt-2 text-3xl font-bold text-slate-900">Document automation dashboard</h2>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={exportReport}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300"
                >
                  Export report
                </button>
                <button
                  type="button"
                  onClick={() => openNewDocument()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"
                >
                  <Plus size={16} />
                  New document
                </button>
              </div>
            </div>
            <nav className="mt-5 flex gap-2 overflow-x-auto lg:hidden" aria-label="Main navigation">
              {navigation.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item)}
                  className="whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
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
              Loading dashboard…
            </div>
          ) : (
            <>
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

              <section id="documents" className="scroll-mt-8">
                <div className="card">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                        Documents
                      </p>
                      <h3 className="text-xl font-semibold text-slate-900">Recent document history</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('documents')
                        document.getElementById('documents-list')?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="text-sm font-medium text-brand-700"
                    >
                      View all
                    </button>
                  </div>

                  <DocumentTable
                    documents={dashboard.latest_documents || []}
                    onDownload={downloadDocument}
                    onDelete={deleteDocument}
                    deletingDocumentId={deletingDocumentId}
                  />
                </div>

              </section>

              <section id="templates" className="mt-8 scroll-mt-8 card">
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
                  <button
                    type="button"
                    onClick={() => setDialog('upload-template')}
                    className="text-sm font-medium text-brand-700"
                  >
                    Upload template
                  </button>
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

              <section id="documents-list" className="mt-8 scroll-mt-8 card">
                <h3 className="mb-4 text-xl font-semibold text-slate-900">All documents</h3>
                <DocumentTable
                  documents={documents}
                  onDownload={downloadDocument}
                  onDelete={deleteDocument}
                  deletingDocumentId={deletingDocumentId}
                />
              </section>
            </>
          )}
        </main>
      </div>

      {dialog === 'new-document' && (
        <Modal title="Isi dokumen dari template" onClose={() => setDialog(null)}>
          <form onSubmit={generateDocument} className="space-y-4">
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
            <label className="block text-sm font-medium text-slate-700">
              Nama dokumen hasil
              <input
                name="document_name"
                placeholder="Contoh: Reimbursement November"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
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
                {templateAnalysis.fields.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="font-semibold text-slate-900">Informasi dokumen</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {templateAnalysis.fields.map((field) => (
                        <label key={field.key} className="block text-sm font-medium text-slate-700">
                          {field.label}
                          <input
                            type="text"
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
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">Rincian item</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setItemRows((current) => [...current, {}])
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700"
                    >
                      <Plus size={15} />
                      Tambah item
                    </button>
                  </div>
                  {templateAnalysis.headers.some((header) => !header.editable) && (
                    <p className="text-xs text-slate-500">
                      Kolom dengan rumus pada template akan dihitung otomatis.
                    </p>
                  )}
                  {itemRows.map((item, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="space-y-3 rounded-xl border border-slate-200 p-3"
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
                      <div className="grid gap-3 sm:grid-cols-2">
                        {templateAnalysis.headers.filter((header) => header.editable).map((header) => (
                          <label
                            key={header.key}
                            className="block text-sm font-medium text-slate-700"
                          >
                            {header.label}
                            <input
                              type="text"
                              value={item[header.key] || ''}
                              onChange={(event) =>
                                updateItemValue(rowIndex, header.key, event.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}
            <ModalActions onCancel={() => setDialog(null)} saving={saving} submitLabel="Generate" />
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

function DocumentTable({ documents, onDownload, onDelete, deletingDocumentId }) {
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
              <td className="py-3 pr-4 font-medium text-slate-800">{item.name}</td>
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
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onDownload(item)}
                    className="inline-flex items-center gap-2 text-brand-700"
                  >
                    <Download size={14} />
                    Download
                  </button>
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

function Modal({ title, onClose, children }) {
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
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
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

function ModalActions({ onCancel, saving, submitLabel }) {
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
        disabled={saving}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {saving ? 'Please wait…' : submitLabel}
      </button>
    </div>
  )
}

export default App
