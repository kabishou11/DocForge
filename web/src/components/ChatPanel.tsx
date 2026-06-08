import { useState, useEffect, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send, FileText, Loader2, Download, RotateCcw,
  CheckCircle2, Circle, AlertCircle,
  Globe, Settings2, X, Sparkles,
  Eye, EyeOff, Wifi, RefreshCw, BarChart3, Hash,
  MessageSquare, Upload
} from 'lucide-react'
import {
  useApi,
  fetchTemplates,
  uploadTemplate,
  convertMarkdownToDocx,
  type ConvertMarkdownResult,
  type GenerateParams,
  type ParsedSection,
  API_BASE,
} from '../hooks/useApi'

interface Template {
  name: string
  path: string
  size: number
  ext: string
}

export function ChatPanel() {
  // Template state
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [markdownFileName, setMarkdownFileName] = useState('')
  const [markdownInput, setMarkdownInput] = useState('')
  const [isConvertingMarkdown, setIsConvertingMarkdown] = useState(false)
  const [convertResult, setConvertResult] = useState<ConvertMarkdownResult | null>(null)
  const [convertError, setConvertError] = useState<string | null>(null)

  // Generation params
  const [topic, setTopic] = useState('')
  const [wordCount, setWordCount] = useState(3000)
  const [enableSearch, setEnableSearch] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  // Modify mode
  const [isModifyMode, setIsModifyMode] = useState(false)
  const [modifyRequest, setModifyRequest] = useState('')

  // Display
  const [showPreview, setShowPreview] = useState(true)
  const streamRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modifyInputRef = useRef<HTMLTextAreaElement>(null)

  const {
    isGenerating, progress, currentStep, streamText, streamState, result, error,
    connectionStatus, generate, modify, abort, clear
  } = useApi()

  // Load templates on mount
  useEffect(() => {
    loadTemplates()
  }, [])

  // Auto-select first template if only one exists
  useEffect(() => {
    if (templates.length === 1 && !selectedTemplate) {
      setSelectedTemplate(templates[0])
    }
  }, [templates, selectedTemplate])

  const loadTemplates = async () => {
    try {
      const data = await fetchTemplates()
      if (Array.isArray(data)) setTemplates(data)
    } catch {}
  }

  const handleTemplateUpload = async (file: File) => {
    if (!file.name.match(/\.(docx|md|txt)$/i)) return
    setUploading(true)
    try {
      const res = await uploadTemplate(file)
      if (res.success) {
        await loadTemplates()
        // Auto-select newly uploaded template
        const updated = await fetchTemplates()
        if (Array.isArray(updated)) {
          setTemplates(updated)
          const justUploaded = updated.find((t: Template) => t.name === file.name)
          if (justUploaded) setSelectedTemplate(justUploaded)
        }
      }
    } catch {} finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleTemplateUpload(file)
  }

  // Auto-scroll stream
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
    if (previewRef.current && showPreview) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight
    }
  }, [streamText, showPreview])

  // Focus modify input when entering modify mode
  useEffect(() => {
    if (isModifyMode && modifyInputRef.current) {
      modifyInputRef.current.focus()
    }
  }, [isModifyMode])

  const handleGenerate = () => {
    if (!topic.trim() || !selectedTemplate) return
    const params: GenerateParams = {
      type: 'from-template',
      topic: topic.trim(),
      description: '',
      templatePath: selectedTemplate.name,
      wordCount,
      enableSearch,
    }
    setIsModifyMode(false)
    generate(params)
  }

  const handleConvertMarkdown = async () => {
    const markdown = markdownInput.trim()
    if (!markdown) {
      setConvertError('请先粘贴 Markdown 内容')
      return
    }
    setIsConvertingMarkdown(true)
    setConvertError(null)
    setConvertResult(null)
    try {
      const data = await convertMarkdownToDocx({
        fileName: markdownFileName.trim() || undefined,
        markdown,
        templateName: selectedTemplate?.name,
      })
      setConvertResult(data)
    } catch (err: any) {
      setConvertError(err.message || 'Markdown 转 DOCX 失败')
    } finally {
      setIsConvertingMarkdown(false)
    }
  }

  const handleModify = () => {
    if (!modifyRequest.trim()) return
    modify({
      topic: topic.trim(),
      templatePath: selectedTemplate?.name,
      currentContent: streamText,
      modifyRequest: modifyRequest.trim(),
      wordCount,
      enableSearch,
    })
    setModifyRequest('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isModifyMode) {
        handleModify()
      } else {
        handleGenerate()
      }
    }
  }

  const handleDownload = (path?: string) => {
    if (!path) return
    window.open(`${API_BASE}/download?path=${encodeURIComponent(path)}`, '_blank')
  }

  const getStepIcon = (_step: string, status?: string) => {
    if (status === 'completed') return <CheckCircle2 size={14} className="text-success" />
    if (status === 'error') return <AlertCircle size={14} className="text-error" />
    if (status === 'started') return <Loader2 size={14} className="text-accent animate-spin" />
    return <Circle size={14} className="text-text-muted" />
  }

  const getStepLabel = (step: string) => {
    const labels: Record<string, string> = {
      'template_parse': '解析模板样式',
      'outline': '生成文档大纲',
      'section_search': '联网搜索',
      'section_generate': '生成章节内容',
      'section_stream': '流式输出',
      'docx_generate': '合成 DOCX',
      'started': '准备中',
      'complete': '完成',
    }
    return labels[step] || step
  }

  const isReady = topic.trim().length > 0 && !!selectedTemplate
  const hasContent = isGenerating || streamText || result
  const isCompleted = !!result && !isGenerating

  const progressPercent = useMemo(() => {
    if (currentStep === 'complete') return 100
    const sectionProgress = progress.find(p => p.step === 'section_stream' || p.step === 'section_generate')
    if (sectionProgress?.sectionIndex !== undefined && sectionProgress?.sectionTotal) {
      return Math.round(((sectionProgress.sectionIndex + 1) / sectionProgress.sectionTotal) * 100)
    }
    const completedSteps = progress.filter(p => p.status === 'completed').length
    return Math.round((completedSteps / Math.max(progress.length, 1)) * 100)
  }, [progress, currentStep])

  const wordCountPercent = useMemo(() => {
    if (!wordCount) return 0
    return Math.min(Math.round((streamState.wordCount / wordCount) * 100), 100)
  }, [streamState.wordCount, wordCount])

  const connectionLabel = useMemo(() => {
    switch (connectionStatus) {
      case 'connected': return { icon: <Wifi size={10} />, text: '已连接', cls: 'text-success' }
      case 'reconnecting': return { icon: <RefreshCw size={10} className="animate-spin" />, text: '重连中', cls: 'text-warning' }
      default: return null
    }
  }, [connectionStatus])

  const shouldShowPreview = showPreview && streamText && hasContent

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const renderMarkdownConvertCard = (compact = false) => (
    <div className={`card text-left animate-slide-up ${compact ? 'p-3' : 'p-4 mb-6'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <FileText size={15} className="text-green-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Markdown 直接转 DOCX</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              粘贴 Obsidian/Markdown 内容，直接生成可交付 Word 文档
            </p>
          </div>
        </div>
        {selectedTemplate && (
          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
            套用 {selectedTemplate.name}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <input
          type="text"
          value={markdownFileName}
          onChange={e => setMarkdownFileName(e.target.value)}
          placeholder="可选文件名，例如：项目汇报.docx"
          disabled={isConvertingMarkdown}
          className="text-xs !py-2"
        />
        <textarea
          value={markdownInput}
          onChange={e => setMarkdownInput(e.target.value)}
          placeholder="# 标题&#10;&#10;在这里粘贴 Markdown 内容..."
          disabled={isConvertingMarkdown}
          rows={compact ? 4 : 6}
          className="text-xs leading-relaxed resize-none"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-text-muted">
          {markdownInput.trim().length > 0 ? `${markdownInput.trim().length} 字符` : '无需先生成 Markdown 文件'}
        </span>
        <button
          onClick={handleConvertMarkdown}
          disabled={isConvertingMarkdown || !markdownInput.trim()}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
            markdownInput.trim() && !isConvertingMarkdown
              ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
              : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
          }`}
        >
          {isConvertingMarkdown ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          转为 DOCX
        </button>
      </div>

      {convertResult && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={14} className="text-success shrink-0" />
            <span className="truncate text-xs text-green-700">
              转换完成，约 {convertResult.wordCount} 字
            </span>
          </div>
          <button
            onClick={() => handleDownload(convertResult.docxPath)}
            className="btn-primary flex items-center gap-1.5 text-xs !py-1.5 !px-3 shrink-0"
          >
            <Download size={12} />
            下载
          </button>
        </div>
      )}

      {convertError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{convertError}</p>
        </div>
      )}
    </div>
  )

  // ==================== RENDER ====================

  // Show empty state: template picker (hero screen)
  if (!hasContent && !selectedTemplate) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-8 pb-32">
        <div className="text-center max-w-lg animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <Sparkles size={28} className="text-amber-600" />
          </div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">DocForge</h1>
          <p className="text-base text-text-tertiary mb-8">
            选择模板，输入主题，一键生成可呈报的专业文档
          </p>

          {renderMarkdownConvertCard()}

          {/* Template cards */}
          {templates.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto mb-6">
              {templates.slice(0, 4).map(t => (
                <button
                  key={t.name}
                  onClick={() => setSelectedTemplate(t)}
                  className="flex items-center gap-3 p-4 rounded-xl border bg-bg-card border-border-primary hover:border-accent hover:bg-amber-50/50 hover:shadow-sm transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{t.name}</p>
                    <p className="text-[11px] text-text-muted">{t.ext.toUpperCase()} | {(t.size / 1024).toFixed(0)} KB</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted mb-6">暂无模板，请先上传</p>
          )}

          {/* Upload area */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`mx-auto max-w-sm border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
              dragOver ? 'border-accent bg-amber-50/50' : 'border-border-primary hover:border-border-secondary'
            }`}
          >
            <input
              type="file"
              accept=".docx,.md,.txt"
              onChange={e => e.target.files?.[0] && handleTemplateUpload(e.target.files[0])}
              className="hidden"
              id="hero-upload"
            />
            <label htmlFor="hero-upload" className="cursor-pointer block">
              {uploading ? (
                <Loader2 size={20} className="text-accent animate-spin mx-auto mb-1.5" />
              ) : (
                <Upload size={20} className="text-text-muted mx-auto mb-1.5" />
              )}
              <p className="text-xs text-text-muted">
                {uploading ? '上传中...' : '点击或拖拽上传 DOCX / Markdown 模板'}
              </p>
            </label>
          </div>
        </div>
      </div>
    )
  }

  // Show empty state: template selected, waiting for input
  if (!hasContent && selectedTemplate) {
    return (
      <div className="h-full flex flex-col">
        {/* Top bar: selected template + date */}
        <header className="px-6 py-3 border-b border-border-primary flex items-center justify-between shrink-0 bg-bg-secondary">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedTemplate(null); clear() }}
              className="text-text-muted hover:text-text-secondary text-xs flex items-center gap-1 transition-colors"
            >
              &larr; 切换模板
            </button>
            <span className="text-border-secondary">|</span>
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-blue-500" />
              <span className="text-sm font-medium text-text-primary">{selectedTemplate.name}</span>
            </div>
          </div>
          <span className="text-xs text-text-muted">{today}</span>
        </header>

        {/* Center area: prompt input */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-24">
          <div className="w-full max-w-lg animate-fade-in">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center mx-auto mb-3 shadow-sm">
                <Sparkles size={20} className="text-amber-600" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary mb-1">输入文档主题</h2>
              <p className="text-sm text-text-tertiary">描述您要生成的文档，AI 将自动模仿模板风格生成</p>
            </div>

            <div className="card shadow-lg !border-border-secondary/50">
              <div className="flex items-end gap-2 p-3">
                <textarea
                  ref={inputRef}
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="例如：智慧园区建设方案、年度工作总结、商业计划书..."
                  disabled={isGenerating}
                  rows={1}
                  className="flex-1 !bg-transparent !border-0 !p-0 !shadow-none !outline-none resize-none text-sm leading-relaxed min-h-[24px] max-h-[120px]"
                  style={{ boxShadow: 'none' }}
                  autoFocus
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEnableSearch(!enableSearch)}
                    className={`p-2 rounded-lg transition-colors ${
                      enableSearch
                        ? 'text-accent bg-amber-50'
                        : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary'
                    }`}
                    title="联网搜索"
                  >
                    <Globe size={16} />
                  </button>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-2 rounded-lg transition-colors ${
                      showSettings ? 'text-accent bg-amber-50' : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary'
                    }`}
                    title="设置"
                  >
                    <Settings2 size={16} />
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={!isReady}
                    className={`p-2 rounded-lg transition-all ${
                      isReady
                        ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
                        : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                    }`}
                    title="生成"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>

              {/* Bottom info bar */}
              <div className="px-3 pb-2.5 flex items-center gap-2 text-[11px] text-text-muted">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                  <FileText size={10} />
                  {selectedTemplate.name}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary rounded-full">
                  {wordCount} 字
                </span>
                {enableSearch && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded-full">
                    <Globe size={10} />
                    联网搜索
                  </span>
                )}
              </div>

              {/* Settings popover */}
              {showSettings && (
                <div className="px-3 pb-3 border-t border-border-primary pt-3 animate-slide-up">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">目标字数</label>
                      <input
                        type="number"
                        value={wordCount}
                        onChange={e => setWordCount(Number(e.target.value))}
                        disabled={isGenerating}
                        min={500}
                        max={20000}
                        step={500}
                        className="w-full text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          onClick={() => setEnableSearch(!enableSearch)}
                          className={`w-9 h-5 rounded-full transition-colors relative ${
                            enableSearch ? 'bg-accent' : 'bg-border-secondary'
                          }`}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                            style={{ transform: enableSearch ? 'translateX(16px)' : 'translateX(0)', left: '2px' }}
                          />
                        </button>
                        <span className="text-xs text-text-secondary">联网搜索</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4">
              {renderMarkdownConvertCard(true)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ==================== MAIN VIEW: Generating / Result ====================
  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="px-6 py-2.5 border-b border-border-primary flex items-center justify-between shrink-0 bg-bg-secondary">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-full">
            <FileText size={13} className="text-amber-700" />
            <span className="text-xs font-medium text-amber-800">{selectedTemplate?.name || '模板'}</span>
          </div>
          <span className="text-border-secondary">|</span>
          <span className="text-xs font-medium text-text-primary">{topic}</span>
          <span className="text-border-secondary">|</span>
          <span className="text-xs text-text-muted">{today}</span>
        </div>
        <div className="flex items-center gap-2">
          {connectionLabel && (
            <span className={`flex items-center gap-1 text-xs ${connectionLabel.cls}`}>
              {connectionLabel.icon}
              {connectionLabel.text}
            </span>
          )}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`p-1.5 rounded-lg transition-colors ${
              showPreview ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary'
            }`}
            title={showPreview ? '隐藏预览' : '显示预览'}
          >
            {showPreview ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            onClick={() => { clear(); setIsModifyMode(false) }}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
            title="重新开始"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </header>

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Progress + Stream */}
        <div className="flex-1 overflow-y-auto" ref={streamRef}>
          <div className="px-6 py-4 max-w-4xl mx-auto pb-40">
            {/* Progress steps */}
            {progress.length > 0 && (
              <div className="mb-4 card p-3 animate-slide-up">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {progress.map((p, i) => (
                    <div key={`${p.step}-${i}`} className="flex items-center gap-1.5 animate-slide-in">
                      {getStepIcon(p.step, p.status)}
                      <span className={`text-xs ${
                        p.status === 'completed' ? 'text-text-secondary' :
                        p.status === 'started' ? 'text-accent font-medium' :
                        'text-text-muted'
                      }`}>
                        {getStepLabel(p.step)}
                      </span>
                      {p.status === 'started' && p.sectionTitle && (
                        <span className="text-xs text-text-muted">
                          ({p.sectionIndex !== undefined ? `${p.sectionIndex + 1}/${p.sectionTotal}` : ''} {p.sectionTitle.slice(0, 20)})
                        </span>
                      )}
                      {p.status === 'completed' && p.wordCount && (
                        <span className="text-xs text-text-muted">{p.wordCount}字</span>
                      )}
                      {i < progress.length - 1 && (
                        <span className="text-text-muted mx-1">/</span>
                      )}
                    </div>
                  ))}
                </div>
                {isGenerating && (
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="progress-bar flex-1">
                      <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-text-muted shrink-0">{progressPercent}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Live stats */}
            {isGenerating && streamState.wordCount > 0 && (
              <div className="mb-3 card p-2.5 animate-slide-up">
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-text-secondary">
                    <BarChart3 size={11} className="text-accent" />
                    <span className="font-medium">实时</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-text-muted">
                    <Hash size={10} />
                    <span>{streamState.wordCount} / {wordCount} 字</span>
                    <div className="w-14 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${wordCountPercent}%` }} />
                    </div>
                  </div>
                  {streamState.sections.length > 0 && (
                    <div className="flex items-center gap-1.5 text-text-muted">
                      <FileText size={10} />
                      <span>{streamState.sections.filter(s => s.complete).length + 1} / {streamState.sections.length} 章节</span>
                    </div>
                  )}
                  {streamState.sections.length > 0 && streamState.sections[streamState.activeSection] && (
                    <div className="flex items-center gap-1 text-accent/70 truncate">
                      <Loader2 size={10} className="animate-spin" />
                      <span className="truncate">{streamState.sections[streamState.activeSection].title}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stream output */}
            {(streamText || isGenerating) && (
              <div className="card p-5 animate-slide-up">
                <div className="markdown-content font-mono text-sm leading-relaxed">
                  {streamText}
                  {isGenerating && currentStep === 'section_stream' && (
                    <span className="stream-cursor" />
                  )}
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="mt-3 card p-4 animate-slide-up">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 size={12} className="text-success" />
                    </div>
                    <span className="text-sm font-semibold text-text-primary">生成完成</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsModifyMode(true)}
                      className="text-xs text-accent hover:text-accent-hover flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                    >
                      <MessageSquare size={12} />
                      继续修改
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div className="bg-bg-tertiary rounded-xl p-2.5 text-center">
                      <p className="text-base font-bold text-accent">{result.sectionCount}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">章节数</p>
                    </div>
                    <div className="bg-bg-tertiary rounded-xl p-2.5 text-center">
                      <p className="text-base font-bold text-accent">{result.wordCount}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">总字数</p>
                    </div>
                    <div className="bg-bg-tertiary rounded-xl p-2.5 text-center">
                      <p className="text-base font-bold text-accent">{result.docxPath ? 'DOCX' : 'MD'}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">格式</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {result.docxPath && (
                      <button
                        onClick={() => handleDownload(result.docxPath)}
                        className="btn-primary flex items-center gap-1.5 text-xs !py-1.5 !px-3"
                      >
                        <Download size={13} />
                        下载 DOCX
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(result.filePath)}
                      className="btn-secondary flex items-center gap-1.5 text-xs !py-1.5 !px-3"
                    >
                      <Download size={13} />
                      Markdown
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-3 card p-3 border-error/20 animate-slide-up">
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
                  <p className="text-xs text-error">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Markdown Preview */}
        {shouldShowPreview && (
          <div className="w-[40%] min-w-[300px] max-w-[480px] flex flex-col bg-bg-secondary border-l border-border-primary animate-fade-in shrink-0">
            <div className="px-4 py-2.5 border-b border-border-primary flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Eye size={13} className="text-accent" />
                <span className="text-xs font-medium text-text-secondary">文档预览</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-text-muted">
                <span>{streamState.sections.length} 章节</span>
                <span className="text-border-secondary">|</span>
                <span>{streamState.charCount} 字符</span>
              </div>
            </div>

            {/* Section nav */}
            {streamState.sections.length > 1 && (
              <div className="px-3 py-1.5 border-b border-border-primary overflow-x-auto shrink-0">
                <div className="flex gap-1">
                  {streamState.sections.map((section, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const el = previewRef.current?.querySelector(`[data-section="${i}"]`)
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      className={`px-2 py-0.5 text-[10px] rounded-md whitespace-nowrap transition-colors ${
                        i === streamState.activeSection
                          ? 'bg-accent/15 text-accent font-medium'
                          : section.complete
                            ? 'text-text-muted hover:bg-bg-hover'
                            : 'text-accent/60'
                      }`}
                    >
                      {!section.complete && i === streamState.activeSection && (
                        <Loader2 size={8} className="inline mr-0.5 animate-spin" />
                      )}
                      {section.title.slice(0, 12)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Rendered preview */}
            <div ref={previewRef} className="flex-1 overflow-y-auto px-4 py-3">
              <div className="preview-markdown text-sm">
                {streamState.sections.map((section, i) => (
                  <PreviewSection
                    key={i}
                    section={section}
                    index={i}
                    isActive={i === streamState.activeSection}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom fixed input area */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg-primary via-bg-primary to-bg-primary/0 pointer-events-none z-10">
        <div className="px-6 pb-4 pt-10 pointer-events-auto" style={{ maxWidth: shouldShowPreview ? '50%' : '48rem', margin: '0 auto' }}>
          {/* Modify mode input */}
          {isModifyMode && isCompleted ? (
            <div className="card shadow-lg !border-accent/30 animate-slide-up">
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                <MessageSquare size={12} className="text-accent" />
                <span className="text-[11px] font-medium text-accent">对话式修改</span>
                <span className="text-[10px] text-text-muted">-- 输入修改要求，保持模板风格</span>
              </div>
              <div className="flex items-end gap-2 px-3 pb-2.5">
                <textarea
                  ref={modifyInputRef}
                  value={modifyRequest}
                  onChange={e => setModifyRequest(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleModify() }
                    if (e.key === 'Escape') { setIsModifyMode(false); setModifyRequest('') }
                  }}
                  placeholder='例如："请把第三章展开更详细"、"添加一个预算表"、"修改引言的措辞"'
                  disabled={isGenerating}
                  rows={1}
                  className="flex-1 !bg-transparent !border-0 !p-0 !shadow-none !outline-none resize-none text-sm leading-relaxed min-h-[24px] max-h-[100px]"
                  style={{ boxShadow: 'none' }}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setIsModifyMode(false); setModifyRequest('') }}
                    className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
                    title="取消"
                  >
                    <X size={15} />
                  </button>
                  <button
                    onClick={handleModify}
                    disabled={!modifyRequest.trim() || isGenerating}
                    className={`p-2 rounded-lg transition-all ${
                      modifyRequest.trim() && !isGenerating
                        ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
                        : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                    }`}
                    title="提交修改"
                  >
                    {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Normal input */
            <div className="card shadow-lg !border-border-secondary/50">
              <div className="flex items-end gap-2 p-3">
                <textarea
                  ref={inputRef}
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isCompleted ? '输入新主题重新生成...' : '输入文档主题...'}
                  disabled={isGenerating}
                  rows={1}
                  className="flex-1 !bg-transparent !border-0 !p-0 !shadow-none !outline-none resize-none text-sm leading-relaxed min-h-[24px] max-h-[120px]"
                  style={{ boxShadow: 'none' }}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEnableSearch(!enableSearch)}
                    className={`p-2 rounded-lg transition-colors ${
                      enableSearch ? 'text-accent bg-amber-50' : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary'
                    }`}
                    title="联网搜索"
                  >
                    <Globe size={16} />
                  </button>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-2 rounded-lg transition-colors ${
                      showSettings ? 'text-accent bg-amber-50' : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary'
                    }`}
                    title="设置"
                  >
                    <Settings2 size={16} />
                  </button>
                  <button
                    onClick={isGenerating ? abort : handleGenerate}
                    disabled={!isReady && !isGenerating}
                    className={`p-2 rounded-lg transition-all ${
                      isGenerating
                        ? 'bg-error text-white hover:bg-error/90'
                        : isReady
                          ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
                          : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                    }`}
                    title={isGenerating ? '停止' : '生成'}
                  >
                    {isGenerating ? <X size={16} /> : <Send size={16} />}
                  </button>
                </div>
              </div>

              {/* Settings inline */}
              {showSettings && (
                <div className="px-3 pb-3 border-t border-border-primary pt-2.5 animate-slide-up">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">目标字数</label>
                      <input
                        type="number"
                        value={wordCount}
                        onChange={e => setWordCount(Number(e.target.value))}
                        disabled={isGenerating}
                        min={500}
                        max={20000}
                        step={500}
                        className="w-full text-xs !py-1.5"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          onClick={() => setEnableSearch(!enableSearch)}
                          className={`w-8 h-4.5 rounded-full transition-colors relative ${
                            enableSearch ? 'bg-accent' : 'bg-border-secondary'
                          }`}
                        >
                          <span
                            className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform"
                            style={{ transform: enableSearch ? 'translateX(14px)' : 'translateX(0)', left: '2px' }}
                          />
                        </button>
                        <span className="text-xs text-text-secondary">联网搜索</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom info */}
              <div className="px-3 pb-2.5 flex items-center gap-2 text-[11px] text-text-muted">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                  <FileText size={10} />
                  {selectedTemplate?.name}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary rounded-full">
                  {wordCount} 字
                </span>
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-text-muted mt-2">
            {isModifyMode ? 'Enter 发送 / Esc 取消' : 'Enter 生成 / Esc 重新开始'}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Individual section in the preview panel */
function PreviewSection({
  section,
  index,
  isActive,
}: {
  section: ParsedSection
  index: number
  isActive: boolean
}) {
  return (
    <div
      data-section={index}
      className={`mb-3 relative pl-2.5 border-l-2 transition-all duration-300 ${
        isActive ? 'border-accent opacity-100' : 'border-transparent opacity-60'
      }`}
    >
      {section.level === 1 && (
        <h2 className={`text-[14px] font-semibold mb-1 ${isActive ? 'text-accent' : 'text-text-primary'}`}>
          {!section.complete && isActive && <Loader2 size={9} className="inline mr-1 animate-spin text-accent" />}
          {section.title}
        </h2>
      )}
      {section.level === 2 && (
        <h3 className={`text-[12px] font-semibold mb-1 ${isActive ? 'text-accent' : 'text-text-primary'}`}>
          {!section.complete && isActive && <Loader2 size={9} className="inline mr-1 animate-spin text-accent" />}
          {section.title}
        </h3>
      )}
      {section.level >= 3 && (
        <h4 className={`text-[11px] font-semibold mb-0.5 ${isActive ? 'text-accent' : 'text-text-secondary'}`}>
          {!section.complete && isActive && <Loader2 size={9} className="inline mr-1 animate-spin text-accent" />}
          {section.title}
        </h4>
      )}
      <div className="text-[11px] leading-relaxed text-text-secondary preview-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {section.content}
        </ReactMarkdown>
      </div>
      {isActive && !section.complete && (
        <span className="inline-block w-1 h-2.5 bg-accent animate-pulse ml-0.5 rounded-sm" />
      )}
    </div>
  )
}
