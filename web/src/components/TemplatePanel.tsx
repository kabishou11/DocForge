import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, LayoutTemplate, Trash2, Edit3, Eye, X } from 'lucide-react'
import { fetchTemplates, uploadTemplate, deleteTemplate, renameTemplate, previewTemplate } from '../hooks/useApi'

interface Template {
  name: string
  path: string
  size: number
  ext: string
}

export function TemplatePanel() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [previewData, setPreviewData] = useState<{ name: string; content: string; type: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTemplates()
      setTemplates(Array.isArray(data) ? data : [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleUpload = async (file: File) => {
    if (!file.name.match(/\.(docx|md|txt)$/i)) {
      setMessage({ type: 'error', text: '仅支持 .docx, .md, .txt 文件' })
      return
    }
    setUploading(true)
    try {
      const res = await uploadTemplate(file)
      if (res.success) {
        setMessage({ type: 'success', text: `已上传: ${file.name}` })
        await load()
      } else {
        setMessage({ type: 'error', text: res.message || '上传失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '上传失败' })
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  const handlePreview = async (t: Template) => {
    try {
      const data = await previewTemplate(t.name)
      setPreviewData({ name: t.name, content: data.content || data.preview || '', type: data.type })
    } catch {
      setPreviewData({ name: t.name, content: '无法加载预览', type: 'unknown' })
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteTemplate(name)
      setTemplates(prev => prev.filter(t => t.name !== name))
      setDeleteConfirm(null)
      setMessage({ type: 'success', text: `已删除: ${name}` })
    } catch {
      setMessage({ type: 'error', text: '删除失败' })
    }
  }

  const handleRename = async (oldName: string) => {
    if (!newName.trim() || newName === oldName) {
      setRenaming(null)
      return
    }
    try {
      const res = await renameTemplate(oldName, newName.trim())
      if (res.success) {
        await load()
        setMessage({ type: 'success', text: `已重命名为: ${newName.trim()}` })
      } else {
        setMessage({ type: 'error', text: res.message || '重命名失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '重命名失败' })
    } finally {
      setRenaming(null)
      setNewName('')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-8 py-5 border-b border-border-primary shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <LayoutTemplate size={18} className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">模板管理</h1>
            <p className="text-xs text-text-tertiary mt-0.5">上传 DOCX/Markdown 模板用于风格迁移</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Upload area */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
            dragOver
              ? 'border-accent bg-amber-50/50 shadow-sm'
              : 'border-border-primary bg-bg-card hover:border-border-secondary hover:shadow-sm'
          }`}
        >
          <input
            type="file"
            accept=".docx,.md,.txt"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
            className="hidden"
            id="template-upload"
          />
          <label htmlFor="template-upload" className="cursor-pointer block">
            {uploading ? (
              <Loader2 size={36} className="text-accent animate-spin mx-auto mb-3" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <Upload size={24} className="text-amber-500" />
              </div>
            )}
            <p className="text-sm text-text-primary font-medium">
              {uploading ? '上传中...' : '点击或拖拽上传模板'}
            </p>
            <p className="text-xs text-text-muted mt-1.5">支持 .docx, .md, .txt</p>
          </label>
        </div>

        {/* Message */}
        {message && (
          <div className={`mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm animate-fade-in ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {message.text}
          </div>
        )}

        {/* Template list */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">
            模板列表 ({templates.length})
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-accent animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <FileText size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无模板，请上传</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map(t => (
                <div
                  key={t.name}
                  className="card flex items-center gap-4 p-4 hover:shadow-md transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <FileText size={20} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {renaming === t.name ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRename(t.name); if (e.key === 'Escape') setRenaming(null) }}
                          className="flex-1 !py-1 !px-2 text-sm"
                          autoFocus
                        />
                        <button onClick={() => handleRename(t.name)} className="text-xs text-accent hover:underline">确认</button>
                        <button onClick={() => setRenaming(null)} className="text-xs text-text-muted hover:underline">取消</button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-text-primary truncate">{t.name}</p>
                        <p className="text-xs text-text-muted mt-0.5">{formatSize(t.size)}</p>
                      </>
                    )}
                  </div>
                  {renaming !== t.name && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handlePreview(t)}
                        className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-accent transition-colors"
                        title="预览"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => { setRenaming(t.name); setNewName(t.name) }}
                        className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-accent transition-colors"
                        title="重命名"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(t.name)}
                        className="p-2 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setPreviewData(null)}>
          <div className="card w-[600px] max-h-[70vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border-primary flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-accent" />
                <span className="text-sm font-medium text-text-primary">{previewData.name}</span>
              </div>
              <button onClick={() => setPreviewData(null)} className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-muted">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="preview-markdown text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewData.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="card w-80 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-text-primary mb-2">确认删除</h3>
            <p className="text-xs text-text-secondary mb-4">
              确定要删除模板 "{deleteConfirm}" 吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-xs !py-1.5 !px-3">
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-3 py-1.5 bg-error text-white text-xs font-medium rounded-lg hover:bg-error/90 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
