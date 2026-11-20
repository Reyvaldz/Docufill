import { Copy as CopyIcon, Download, Eye, Pencil, Trash2 } from 'lucide-react'

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
              <td className="py-3">
                <div className="space-y-2">
                  {item.folder_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        disabled={openingDocumentId === item.id}
                        onClick={() => onPreviewFolder(item)}
                        className="inline-flex items-center gap-1.5 text-slate-700 disabled:opacity-50"
                      >
                        <Eye size={14} />
                        Lihat folder
                      </button>
                      <span aria-hidden="true" className="text-slate-300">
                        |
                      </span>
                      <button
                        type="button"
                        onClick={() => onDownload(item)}
                        className="inline-flex items-center gap-1.5 text-brand-700"
                      >
                        <Download size={14} />
                        Unduh folder
                      </button>
                    </div>
                  )}
                  {!item.folder_name && (
                    <button
                      type="button"
                      onClick={() => onDownload(item)}
                      className="inline-flex items-center gap-1.5 text-brand-700"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  )}
                  {item.file_path?.toLowerCase().endsWith('.xlsx') && (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
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
                  )}
                  {!item.file_path?.toLowerCase().endsWith('.xlsx') && (
                    <button
                      type="button"
                      disabled={deletingDocumentId === item.id}
                      onClick={() => onDelete(item)}
                      className="inline-flex items-center gap-1.5 text-sm text-red-700 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      {deletingDocumentId === item.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
