import { Copy as CopyIcon, Download, Eye, Pencil, Trash2 } from 'lucide-react'

const statusStyles = {
  approved: 'bg-emerald-100 text-emerald-800',
  generated: 'bg-blue-100 text-blue-800',
  pending: 'bg-amber-100 text-amber-800',
  draft: 'bg-slate-200 text-slate-700',
}

export default function DocumentTable({
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
              <td className="py-3 pr-4 text-slate-600">
                {item.template_name || 'Reimbursement Form'}
              </td>
              <td className="py-3 pr-4">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    statusStyles[item.status] || statusStyles.generated
                  }`}
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
