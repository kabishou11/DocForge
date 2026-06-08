import { useState, useCallback, useRef, useEffect } from 'react'

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3456/api'

export interface ProgressEvent {
  step: string
  status: 'started' | 'completed' | 'error'
  message?: string
  sectionIndex?: number
  sectionTotal?: number
  sectionTitle?: string
  wordCount?: number
  targetWords?: number
  streamChunk?: string
  searchQuery?: string
  searchResults?: number
  sections?: Array<{ title: string }>
}

export interface GenerationResult {
  filePath: string
  docxPath?: string
  sectionCount: number
  wordCount: number
}

export interface ConvertMarkdownParams {
  fileName?: string
  markdown: string
  templateName?: string
  assetRoot?: string
}

export interface ConvertMarkdownResult {
  success: true
  filePath?: string
  docxPath: string
  wordCount: number
}

export interface StreamState {
  /** Parsed sections from the streamed markdown */
  sections: ParsedSection[]
  /** Current character count */
  charCount: number
  /** Current word count (Chinese chars) */
  wordCount: number
  /** Currently generating section index */
  activeSection: number
}

export interface ParsedSection {
  title: string
  level: number
  content: string
  complete: boolean
}

interface UseApiReturn {
  isGenerating: boolean
  progress: ProgressEvent[]
  currentStep: string
  streamText: string
  streamState: StreamState
  result: GenerationResult | null
  error: string | null
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected'
  generate: (params: GenerateParams) => void
  modify: (params: ModifyParams) => void
  abort: () => void
  clear: () => void
}

export interface GenerateParams {
  type: 'from-template'
  topic: string
  description: string
  templatePath?: string
  wordCount?: number
  enableSearch?: boolean
}

export interface ModifyParams {
  topic: string
  templatePath?: string
  currentContent: string
  modifyRequest: string
  wordCount?: number
  enableSearch?: boolean
}

/** Parse markdown text into sections */
function parseSections(text: string): ParsedSection[] {
  const sections: ParsedSection[] = []
  const lines = text.split('\n')
  let current: ParsedSection | null = null

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      if (current) {
        sections.push(current)
      }
      current = {
        title: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: '',
        complete: false,
      }
    } else if (current) {
      current.content += line + '\n'
    }
  }

  if (current) {
    sections.push(current)
  }

  // Mark all but the last section as complete
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].complete = true
  }

  return sections
}

/** Count Chinese characters and words */
function countWords(text: string): number {
  // Count Chinese characters individually and English words
  const chinese = (text.match(/[一-鿿]/g) || []).length
  const english = (text.match(/[a-zA-Z]+/g) || []).length
  return chinese + english
}

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 2000

export function useApi(): UseApiReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent[]>([])
  const [currentStep, setCurrentStep] = useState('')
  const [streamText, setStreamText] = useState('')
  const [streamState, setStreamState] = useState<StreamState>({
    sections: [],
    charCount: 0,
    wordCount: 0,
    activeSection: 0,
  })
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected')

  const abortRef = useRef<AbortController | null>(null)
  const paramsRef = useRef<GenerateParams | null>(null)
  const reconnectCountRef = useRef(0)
  const isMountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  // Update stream state when streamText changes
  useEffect(() => {
    if (streamText) {
      setStreamState({
        sections: parseSections(streamText),
        charCount: streamText.length,
        wordCount: countWords(streamText),
        activeSection: parseSections(streamText).length - 1,
      })
    }
  }, [streamText])

  const handleEvent = useCallback((data: any) => {
    if (!isMountedRef.current) return

    switch (data.type) {
      case 'start':
        setCurrentStep('started')
        setConnectionStatus('connected')
        break
      case 'step':
        setProgress(prev => [...prev, data.data])
        setCurrentStep(data.data.step)
        break
      case 'progress':
        setProgress(prev => {
          const filtered = prev.filter(p => p.step !== data.data.step)
          return [...filtered, data.data]
        })
        setCurrentStep(data.data.step)
        if (data.data.streamChunk) {
          setStreamText(prev => prev + data.data.streamChunk)
        }
        break
      case 'complete':
        setResult(data.data)
        setCurrentStep('complete')
        setConnectionStatus('disconnected')
        break
      case 'error':
        setError(data.data.message)
        setIsGenerating(false)
        setConnectionStatus('disconnected')
        break
    }
  }, [])

  const startStream = useCallback(async (params: GenerateParams, isRetry = false) => {
    const controller = new AbortController()
    abortRef.current = controller

    if (!isRetry) {
      reconnectCountRef.current = 0
    }

    try {
      setConnectionStatus(reconnectCountRef.current > 0 ? 'reconnecting' : 'connected')

      const response = await fetch(`${API_BASE}/generate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      })

      if (!response.body) {
        setError('响应为空')
        setIsGenerating(false)
        setConnectionStatus('disconnected')
        return
      }

      reconnectCountRef.current = 0 // Reset on successful connection
      setConnectionStatus('connected')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              handleEvent(data)
            } catch {
              // ignore parse error for keepalive lines
            }
          }
        }
      }

      if (isMountedRef.current) {
        setIsGenerating(false)
        setConnectionStatus('disconnected')
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled - don't reconnect
        if (isMountedRef.current) {
          setIsGenerating(false)
          setConnectionStatus('disconnected')
        }
        return
      }

      // Attempt reconnection for network errors
      if (
        reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS &&
        paramsRef.current &&
        isMountedRef.current
      ) {
        reconnectCountRef.current++
        setConnectionStatus('reconnecting')
        setError(`连接中断，${RECONNECT_DELAY_MS / 1000}秒后重试 (${reconnectCountRef.current}/${MAX_RECONNECT_ATTEMPTS})...`)

        await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS))

        if (isMountedRef.current && paramsRef.current) {
          setError(null)
          await startStream(paramsRef.current, true)
        }
      } else {
        if (isMountedRef.current) {
          setError(err.message || '请求失败')
          setIsGenerating(false)
          setConnectionStatus('disconnected')
        }
      }
    }
  }, [handleEvent])

  const generate = useCallback((params: GenerateParams) => {
    // Abort any existing generation first
    if (abortRef.current) {
      abortRef.current.abort()
    }

    setIsGenerating(true)
    setProgress([])
    setCurrentStep('')
    setStreamText('')
    setStreamState({ sections: [], charCount: 0, wordCount: 0, activeSection: 0 })
    setResult(null)
    setError(null)
    paramsRef.current = params

    startStream(params)
  }, [startStream])

  const modify = useCallback((params: ModifyParams) => {
    if (abortRef.current) {
      abortRef.current.abort()
    }

    setIsGenerating(true)
    setProgress([])
    setCurrentStep('')
    setStreamText('')
    setStreamState({ sections: [], charCount: 0, wordCount: 0, activeSection: 0 })
    setResult(null)
    setError(null)

    // 使用 modify 专用流式 API
    const doModify = async () => {
      const controller = new AbortController()
      abortRef.current = controller

      try {
        setConnectionStatus('connected')
        const response = await fetch(`${API_BASE}/generate/modify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: controller.signal,
        })

        if (!response.body) {
          setError('响应为空')
          setIsGenerating(false)
          setConnectionStatus('disconnected')
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                handleEvent(data)
              } catch {}
            }
          }
        }

        if (isMountedRef.current) {
          setIsGenerating(false)
          setConnectionStatus('disconnected')
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          if (isMountedRef.current) {
            setIsGenerating(false)
            setConnectionStatus('disconnected')
          }
          return
        }
        if (isMountedRef.current) {
          setError(err.message || '请求失败')
          setIsGenerating(false)
          setConnectionStatus('disconnected')
        }
      }
    }

    doModify()
  }, [handleEvent])

  const abort = useCallback(() => {
    // Abort local fetch
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    paramsRef.current = null
    reconnectCountRef.current = MAX_RECONNECT_ATTEMPTS // Prevent reconnection

    // Also tell server to stop
    fetch(`${API_BASE}/generate/cancel`, { method: 'POST' }).catch(() => {})

    if (isMountedRef.current) {
      setIsGenerating(false)
      setConnectionStatus('disconnected')
    }
  }, [])

  const clear = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    paramsRef.current = null
    setProgress([])
    setCurrentStep('')
    setStreamText('')
    setStreamState({ sections: [], charCount: 0, wordCount: 0, activeSection: 0 })
    setResult(null)
    setError(null)
    setConnectionStatus('disconnected')
  }, [])

  return {
    isGenerating,
    progress,
    currentStep,
    streamText,
    streamState,
    result,
    error,
    connectionStatus,
    generate,
    modify,
    abort,
    clear,
  }
}

// Simple fetch helpers with basic caching
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30_000 // 30 seconds

async function cachedFetch<T>(url: string, ttl = CACHE_TTL): Promise<T> {
  const cached = cache.get(url)
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T
  }
  const res = await fetch(url)
  const data = await res.json()
  cache.set(url, { data, timestamp: Date.now() })
  return data as T
}

function invalidateCache(pattern: string) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key)
    }
  }
}

export async function fetchModels() {
  return cachedFetch<any>(`${API_BASE}/models`)
}

export async function fetchTemplates() {
  return cachedFetch<any>(`${API_BASE}/templates`)
}

export async function fetchHistory() {
  return cachedFetch<any>(`${API_BASE}/history`, 10_000) // 10s TTL for history
}

export async function setApiKey(apiKey: string) {
  const res = await fetch(`${API_BASE}/config/apikey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
  return res.json()
}

export async function selectLLM(modelId: string) {
  const res = await fetch(`${API_BASE}/models/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId }),
  })
  return res.json()
}

export async function testConnection() {
  // 优先使用新 API
  try {
    return await testModelConnection()
  } catch {
    return cachedFetch<any>(`${API_BASE}/models/test`, 5_000)
  }
}

export async function uploadTemplate(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/upload/template`, {
    method: 'POST',
    body: formData,
  })
  invalidateCache('templates')
  return res.json()
}

export async function deleteTemplate(name: string) {
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  invalidateCache('templates')
  return res.json()
}

export async function renameTemplate(name: string, newName: string) {
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(name)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  })
  invalidateCache('templates')
  return res.json()
}

export async function previewTemplate(name: string) {
  const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(name)}/preview`)
  return res.json()
}

export async function deleteHistory(name: string) {
  const res = await fetch(`${API_BASE}/history/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  invalidateCache('history')
  return res.json()
}

export async function previewHistory(name: string) {
  const res = await fetch(`${API_BASE}/history/${encodeURIComponent(name)}/preview`)
  return res.json()
}

export async function convertMarkdownToDocx(params: ConvertMarkdownParams): Promise<ConvertMarkdownResult> {
  const res = await fetch(`${API_BASE}/convert/markdown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || data?.error || 'Markdown 转 DOCX 失败')
  }
  invalidateCache('history')
  return data as ConvertMarkdownResult
}

// ========== Model Config API (新) ==========

export interface ModelConfigData {
  format: 'openai' | 'anthropic'
  baseUrl: string
  apiKey: string
  model: string
  hasApiKey: boolean
  ocr: string
}

export interface PresetInfo {
  format: 'openai' | 'anthropic'
  baseUrl: string
  model: string
}

export async function fetchModelConfig(): Promise<ModelConfigData> {
  invalidateCache('model/config') // 不缓存配置
  const res = await fetch(`${API_BASE}/model/config`)
  return res.json()
}

export async function updateModelConfig(config: {
  format?: 'openai' | 'anthropic'
  baseUrl?: string
  apiKey?: string
  model?: string
}) {
  const res = await fetch(`${API_BASE}/model/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  invalidateCache('model')
  return res.json()
}

export async function fetchPresets(): Promise<Record<string, PresetInfo>> {
  return cachedFetch<Record<string, PresetInfo>>(`${API_BASE}/model/presets`, 300_000)
}

export async function applyPreset(preset: string) {
  const res = await fetch(`${API_BASE}/model/preset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset }),
  })
  invalidateCache('model')
  return res.json()
}

export async function testModelConnection() {
  invalidateCache('model/test')
  const res = await fetch(`${API_BASE}/model/test`, { method: 'POST' })
  return res.json()
}

// ========== 兼容旧接口 ==========

export async function fetchProviders() {
  return cachedFetch<any>(`${API_BASE}/model/config`, 5_000)
}

export async function selectProvider(_provider: string) {
  // 已废弃，使用 applyPreset 代替
  return { success: true, message: '请使用预设功能' }
}

export async function updateProviderConfig(config: {
  provider?: string
  apiKey?: string
  baseUrl?: string
  model?: string
}) {
  return updateModelConfig({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  })
}
