import { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText, Download, Clock, Loader2, FileSpreadsheet, History,
  Trash2, Eye, X, Search
} from 'lucide-react'
import { fetchHistory, deleteHistory, previewHistory } from '../hooks/useApi'

interface HistoryItem {
  name: string
  path: string
  size: number
  created: string
  type: 'docx' | 'md'
}

export function HistoryPanel() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'docx' | 'md'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [previewItem, setPreviewItem] = useState<{ name: string; content: string; type: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchHistory()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const handleDownload = (item: HistoryItem) => {
    window.open(`http://localhost:3456/api/download?path=${encodeURIComponent(item.path)}`, '_blank')
  }

  const handlePreview = async (item: HistoryItem) => {
    setPreviewLoading(true)
    try {
      const data = await previewHistory(item.name)
      setPreviewItem({ name: item.name, content: data.content, type: data.type })
    } catch {
      setPreviewItem({ name: item.name, content: '无法加载预览', type: 'unknown' })
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteHistory(name)
      setItems(prev => prev.filter(i => i.name !== name))
      setDeleteConfirm(null)
    } catch {
      // silently fail
    }
  }

  // Filtered items
  const filteredItems = items.filter(item => {
    if (filter !== 'all' && item.type !== filter) return false
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-8 py-5 border-b border-border-primary flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <History size={18} className="text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">生成历史</h1>
            <p className="text-xs text-text-tertiary mt-0.5">查看和下载已生成的文档</p>
          </div>
        </div>
        <button
          onClick={load}
          className="btn-secondary flex items-center gap-1.5 text-xs !py-2 !px-3"
        >
          <Clock size={12} />
          刷新
        </button>
      </header>

      {/* Filter bar */}
      <div className="px-8 py-3 border-b border-border-primary flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1 bg-bg-tertiary rounded-lg p-0.5 border border-border-primary">
          {(['all', 'docx', 'md'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                filter === f ? 'bg-accent/15 text-accent font-medium' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {f === 'all' ? '全部' : f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索文件名..."
            className="w-full !pl-8 !py-1.5 text-xs"
          />
        </div>
        <span className="text-xs text-text-muted">{filteredItems.length} 项</span>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="text-accent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-muted">
            <div className="w-16 h-16 rounded-2xl bg-bg-tertiary flex items-center justify-center mb-4">
              <FileText size={28} className="opacity-30" />
            </div>
            <p className="text-sm font-medium">暂无生成记录</p>
            <p className="text-xs mt-1">生成文档后将在此显示</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-w-3xl">
            {filteredItems.map(item => (
              <div
                key={item.name}
                className="card flex items-center gap-4 p-4 group cursor-pointer"
                onClick={() => handleDownload(item)}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  item.type === 'docx'
                    ? 'bg-amber-50'
                    : 'bg-blue-50'
                }`}>
                  {item.type === 'docx' ? (
                    <FileSpreadsheet size={20} className="text-amber-600" />
                  ) : (
                    <FileText size={20} className="text-blue-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{item.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-text-muted">{formatSize(item.size)}</span>
                    <span className="text-[10px] text-text-muted">|</span>
                    <span className="text-xs text-text-muted">{formatDate(item.created)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.type === 'md' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreview(item) }}
                      className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-accent transition-colors"
                      title="预览"
                    >
                      <Eye size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(item) }}
                    className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-accent transition-colors"
                    title="下载"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.name) }}
                    className="p-2 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setPreviewItem(null)}>
          <div className="card w-[700px] max-h-[80vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border-primary flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-accent" />
                <span className="text-sm font-medium text-text-primary">{previewItem.name}</span>
              </div>
              <button onClick={() => setPreviewItem(null)} className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-muted">
                <X size={14} />
              </button>
            </div>
            <div ref={previewRef} className="flex-1 overflow-y-auto p-5">
              {previewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="text-accent animate-spin" />
                </div>
              ) : previewItem.type === 'md' ? (
                <div className="preview-markdown text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewItem.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">{previewItem.content}</p>
              )}
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
              确定要删除 "{deleteConfirm}" 吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn-secondary text-xs !py-1.5 !px-3"
              >
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
