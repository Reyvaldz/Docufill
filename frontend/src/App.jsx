import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CalendarClock,
  CircleDollarSign,
  Download,
  FileText,
  FolderKanban,
  LayoutGrid,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
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
  { label: 'Form Builder', icon: BriefcaseBusiness, action: 'new-document' },
  { label: 'Documents', icon: FolderKanban, target: 'documents' },
  { label: 'Users', icon: Users, target: 'users' },
  { label: 'Workflow', icon: CalendarClock, target: 'workflow' },
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
    if (item.action === 'new-document') {
      setDialog('new-document')
      return
    }

    if (item.target === 'users' || item.target === 'workflow') {
      setNotice(`Menu ${item.label} belum tersedia di API aplikasi ini.`)
      return
    }

    setActiveSection(item.target)
    document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth' })
  }

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
    const formData = new FormData(event.currentTarget)
    const payload = Object.fromEntries(formData.entries())
    payload.nominal = Number(payload.nominal || 0)

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

          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-400">Access</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">Admin</p>
                <p className="text-xs text-slate-400">Document Control</p>
              </div>
              <ShieldCheck className="text-emerald-400" size={18} />
            </div>
          </div>
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
                  onClick={() => setDialog('new-document')}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"
                >
                  <Plus size={16} />
                  New document
                </button>
              </div>
            </div>
            <nav className="mt-5 flex gap-2 overflow-x-auto lg:hidden" aria-label="Main navigation">
              {navigation.slice(0, 4).map((item) => (
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

              <section id="documents" className="scroll-mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
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

                  <DocumentTable documents={dashboard.latest_documents || []} onDownload={downloadDocument} />
                </div>

                <div id="workflow" className="space-y-6 scroll-mt-8">
                  <div className="card">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Workflow</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">Document lifecycle</h3>
                    <ol className="mt-5 space-y-4">
                      {['Select template', 'Configure fields', 'Review preview', 'Generate document'].map(
                        (step, index) => (
                          <li key={step} className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                              {index + 1}
                            </span>
                            <span className="text-sm text-slate-700">{step}</span>
                          </li>
                        ),
                      )}
                    </ol>
                  </div>

                  <div className="card bg-slate-900 text-slate-50">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Activity</p>
                    <ul className="mt-5 space-y-3 text-sm text-slate-200">
                      {(dashboard.recent_activity || []).map((activity) => (
                        <li key={activity} className="flex items-start gap-3">
                          <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                          {activity}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section id="templates" className="mt-8 scroll-mt-8 card">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                      Template library
                    </p>
                    <h3 className="text-xl font-semibold text-slate-900">Managed templates</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDialog('upload-template')}
                    className="text-sm font-medium text-brand-700"
                  >
                    Upload template
                  </button>
                </div>

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
                          <button
                            type="button"
                            onClick={() => {
                              setDialog('new-document')
                              setNotice(`Template "${template.name}" siap digunakan.`)
                            }}
                            className="font-medium text-brand-700"
                          >
                            Use
                          </button>
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
                <DocumentTable documents={documents} onDownload={downloadDocument} />
              </section>
            </>
          )}
        </main>
      </div>

      {dialog === 'new-document' && (
        <Modal title="Create document" onClose={() => setDialog(null)}>
          <form onSubmit={generateDocument} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Template
              <select
                name="template_name"
                required
                defaultValue={templates[0]?.name || ''}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.name}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Document name
              <input
                name="name"
                placeholder="Contoh: Reimbursement November"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="nama" label="Employee name" required />
              <FormField name="tanggal" label="Date" type="date" />
              <FormField name="divisi" label="Department" />
              <FormField name="nominal" label="Amount (IDR)" type="number" />
            </div>
            <FormField name="keperluan" label="Purpose" required />
            <FormField name="keterangan" label="Notes" />
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
              DOCX file
              <input
                name="file"
                type="file"
                accept=".docx"
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

function DocumentTable({ documents, onDownload }) {
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
            <th className="pb-3 font-medium">Action</th>
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
                <button
                  type="button"
                  onClick={() => onDownload(item)}
                  className="inline-flex items-center gap-2 text-brand-700"
                >
                  <Download size={14} />
                  Download
                </button>
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
