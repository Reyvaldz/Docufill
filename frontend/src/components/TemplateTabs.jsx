import { FileText, Mail } from 'lucide-react'

const tabs = [
  { id: 'templates', label: 'Templates Document', icon: FileText },
  { id: 'email-templates', label: 'Templates Email', icon: Mail },
]

export default function TemplateTabs({ activeSection, onSelect }) {
  return (
    <div
      role="tablist"
      aria-label="Jenis template"
      className="flex flex-wrap gap-2 border-b border-slate-200"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`${tab.id}-tab`}
          type="button"
          role="tab"
          aria-selected={activeSection === tab.id}
          aria-controls={`${tab.id}-panel`}
          onClick={() => onSelect(tab.id)}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
            activeSection === tab.id
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <tab.icon size={16} />
          {tab.label}
        </button>
      ))}
    </div>
  )
}
