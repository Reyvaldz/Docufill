import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  Download,
  FileText,
  FolderKanban,
  LayoutGrid,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react'

const API_URL = 'http://localhost:8000/api'

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

function App() {
  const [dashboard, setDashboard] = useState(defaultDashboard)
  const [templates, setTemplates] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardResponse, templatesResponse, documentsResponse] = await Promise.all([
          axios.get(`${API_URL}/dashboard`),
          axios.get(`${API_URL}/templates`),
          axios.get(`${API_URL}/documents`),
        ])

        setDashboard(dashboardResponse.data)
        setTemplates(templatesResponse.data)
        setDocuments(documentsResponse.data)
      } catch (error) {
        console.error('Unable to load DocuFill data', error)
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

            <nav className="space-y-2">
              {[
                { label: 'Dashboard', icon: LayoutGrid, active: true },
                { label: 'Templates', icon: FileText },
                { label: 'Form Builder', icon: BriefcaseBusiness },
                { label: 'Documents', icon: FolderKanban },
                { label: 'Users', icon: Users },
                { label: 'Workflow', icon: CalendarClock },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    item.active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/80'
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
          <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Overview</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Document automation dashboard</h2>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300"
              >
                Export report
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"
              >
                <Plus size={16} />
                New document
              </button>
            </div>
          </header>

          {loading ? (
            <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-card">Loading dashboard…</div>
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

              <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                <div className="card">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Documents</p>
                      <h3 className="text-xl font-semibold text-slate-900">Recent document history</h3>
                    </div>
                    <button type="button" className="text-sm font-medium text-brand-700">
                      View all
                    </button>
                  </div>

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
                        {(dashboard.latest_documents || []).map((item) => (
                          <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                            <td className="py-3 pr-4 font-medium text-slate-800">{item.name}</td>
                            <td className="py-3 pr-4 text-slate-600">{item.category || 'Finance'}</td>
                            <td className="py-3 pr-4 text-slate-600">{item.template_name || 'Reimbursement Form'}</td>
                            <td className="py-3 pr-4">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[item.status] || statusStyles.generated}`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3">
                              <button type="button" className="inline-flex items-center gap-2 text-brand-700">
                                <Download size={14} />
                                Download
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="card">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Workflow</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">Document lifecycle</h3>
                    <ol className="mt-5 space-y-4">
                      {[
                        'Select template',
                        'Configure fields',
                        'Review preview',
                        'Generate document',
                      ].map((step, index) => (
                        <li key={step} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                            {index + 1}
                          </span>
                          <span className="text-sm text-slate-700">{step}</span>
                        </li>
                      ))}
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

              <section className="mt-8 card">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Template library</p>
                    <h3 className="text-xl font-semibold text-slate-900">Managed templates</h3>
                  </div>
                  <button type="button" className="text-sm font-medium text-brand-700">
                    Upload template
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {(templates || []).map((template) => (
                    <div key={template.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-brand-700">
                          {template.status}
                        </span>
                        <span className="text-xs font-medium text-slate-500">v{template.version}</span>
                      </div>
                      <h4 className="text-base font-semibold text-slate-900">{template.name}</h4>
                      <p className="mt-2 text-sm text-slate-600">{template.description || 'Document template ready for form mapping.'}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span>{template.category_name || 'Finance'}</span>
                        <button type="button" className="font-medium text-brand-700">
                          Open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
