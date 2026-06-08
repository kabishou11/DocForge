import { useState, useEffect } from 'react'
import {
  Key, CheckCircle2, AlertCircle, Loader2, Wifi, WifiOff,
  Settings, Zap, Server
} from 'lucide-react'
import {
  fetchModelConfig, updateModelConfig, testModelConnection, type ModelConfigData
} from '../hooks/useApi'

// 预设配置（前端直接定义，不依赖后端）
const PRESET_CONFIGS: Record<string, {
  name: string
  format: 'openai' | 'anthropic'
  baseUrl: string
  model: string
  description: string
}> = {
  'modelscope': {
    name: 'ModelScope',
    format: 'openai',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3.2',
    description: 'DeepSeek-V3.2',
  },
  'deepseek': {
    name: 'DeepSeek',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    description: 'DeepSeek V3',
  },
  'openai': {
    name: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    description: 'GPT-4o',
  },
  'anthropic': {
    name: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    description: 'Claude Sonnet 4',
  },
  'moonshot': {
    name: 'Moonshot',
    format: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-128k',
    description: 'Kimi 128K',
  },
  'zhipu': {
    name: 'Zhipu AI',
    format: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    description: 'GLM-4-Flash',
  },
}

export function ConfigPanel() {
  const [config, setConfig] = useState<ModelConfigData | null>(null)
  const [activePreset, setActivePreset] = useState<string>('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; time?: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 表单状态
  const [formFormat, setFormFormat] = useState<'openai' | 'anthropic'>('openai')
  const [formBaseUrl, setFormBaseUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formModel, setFormModel] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const configData = await fetchModelConfig()
      setConfig(configData)

      // 填充表单
      setFormFormat(configData.format || 'openai')
      setFormBaseUrl(configData.baseUrl || '')
      setFormModel(configData.model || '')
      setFormApiKey('')

      // 检测当前匹配的预设
      detectActivePreset(configData)
    } catch {
      // ignore
    }
  }

  const detectActivePreset = (cfg: ModelConfigData) => {
    for (const [name, preset] of Object.entries(PRESET_CONFIGS)) {
      if (preset.baseUrl === cfg.baseUrl && preset.model === cfg.model) {
        setActivePreset(name)
        return
      }
    }
    setActivePreset('')
  }

  const handlePresetClick = (presetName: string) => {
    const preset = PRESET_CONFIGS[presetName]
    if (!preset) return

    // 直接用前端配置填充表单
    setFormFormat(preset.format)
    setFormBaseUrl(preset.baseUrl)
    setFormModel(preset.model)
    setActivePreset(presetName)
    // 保留用户已输入的 apiKey
    setTestResult(null)
    setMessage(null)
  }

  const handleSave = async () => {
    const trimmedApiKey = formApiKey.trim()
    const hasSavedApiKey = !!config?.hasApiKey

    if (!hasSavedApiKey && trimmedApiKey.length < 10) {
      setMessage({ type: 'error', text: '请输入有效的 API Key（至少 10 个字符）' })
      return
    }
    if (trimmedApiKey && trimmedApiKey.length < 10) {
      setMessage({ type: 'error', text: 'API Key 至少 10 个字符；留空则保留已保存的 Key' })
      return
    }
    if (!formBaseUrl.trim() || !formModel.trim()) {
      setMessage({ type: 'error', text: 'Base URL 和模型名称不能为空' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const res = await updateModelConfig({
        format: formFormat,
        baseUrl: formBaseUrl.trim(),
        model: formModel.trim(),
        ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
      })
      if (res.success) {
        setMessage({ type: 'success', text: '配置已保存' })
        setFormApiKey('')
        await loadData()
      } else {
        setMessage({ type: 'error', text: res.message || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const start = Date.now()
    try {
      const res = await testModelConnection()
      setTestResult({
        success: res.success,
        message: res.message,
        time: res.time || (Date.now() - start),
      })
    } catch {
      setTestResult({ success: false, message: '连接失败', time: Date.now() - start })
    } finally {
      setTesting(false)
    }
  }

  const currentMeta = activePreset ? PRESET_CONFIGS[activePreset] : null

  return (
    <div className="flex flex-col h-full">
      <header className="px-8 py-5 border-b border-border-primary shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Settings size={18} className="text-gray-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">模型配置</h1>
            <p className="text-xs text-text-tertiary mt-0.5">选择预设或自定义配置</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-w-2xl space-y-6">

        {/* 预设选择 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Server size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">快捷预设</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PRESET_CONFIGS).map(([key, preset]) => {
              const isActive = activePreset === key
              return (
                <button
                  key={key}
                  onClick={() => handlePresetClick(key)}
                  className={`relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-sm transition-all ${
                    isActive
                      ? 'border-accent bg-accent/5 shadow-sm font-medium text-accent'
                      : 'border-border-primary text-text-secondary hover:border-border-secondary hover:bg-bg-hover'
                  }`}
                >
                  <span className="text-base font-semibold">{preset.name}</span>
                  <span className="text-[10px] text-text-muted">{preset.description}</span>
                  {isActive && (
                    <CheckCircle2 size={12} className="absolute top-1.5 right-1.5 text-accent" />
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* 分隔线 */}
        <div className="border-t border-border-primary" />

        {/* 自定义配置 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Key size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">自定义配置</h2>
            {currentMeta && (
              <span className="text-[11px] text-accent bg-accent/5 px-2 py-0.5 rounded-full">
                {currentMeta.name} 预设
              </span>
            )}
          </div>
          <div className="card p-5 space-y-4">
            {/* API 格式 */}
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1.5">API 格式</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFormFormat('openai')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all ${
                    formFormat === 'openai'
                      ? 'border-accent bg-accent/5 text-accent font-medium'
                      : 'border-border-primary text-text-secondary hover:border-border-secondary'
                  }`}
                >
                  OpenAI 兼容
                </button>
                <button
                  onClick={() => setFormFormat('anthropic')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all ${
                    formFormat === 'anthropic'
                      ? 'border-accent bg-accent/5 text-accent font-medium'
                      : 'border-border-primary text-text-secondary hover:border-border-secondary'
                  }`}
                >
                  Anthropic
                </button>
              </div>
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1.5">Base URL</label>
              <input
                type="text"
                value={formBaseUrl}
                onChange={e => setFormBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full text-sm"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1.5">
                API Key
                {config?.hasApiKey && (
                  <span className="ml-2 text-green-600 font-normal">
                    <CheckCircle2 size={10} className="inline mr-0.5" />
                    已配置
                  </span>
                )}
              </label>
              <input
                type="password"
                value={formApiKey}
                onChange={e => setFormApiKey(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                placeholder={config?.hasApiKey ? '已保存（留空不变）' : 'sk-...'}
                className="w-full text-sm"
              />
            </div>

            {/* 模型名称 */}
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1.5">模型名称</label>
              <input
                type="text"
                value={formModel}
                onChange={e => setFormModel(e.target.value)}
                placeholder="gpt-4o"
                className="w-full text-sm"
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={handleTest}
                disabled={testing}
                className="btn-secondary flex items-center gap-2 text-sm flex-1"
              >
                {testing ? (
                  <Loader2 size={14} className="animate-spin text-accent" />
                ) : testResult?.success ? (
                  <Wifi size={14} className="text-success" />
                ) : (
                  <WifiOff size={14} className="text-text-muted" />
                )}
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-1.5 text-sm flex-1"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                保存配置
              </button>
            </div>

            {/* 测试结果 */}
            {testResult && (
              <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                testResult.success
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {testResult.success ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                <span>{testResult.message}</span>
                {testResult.time && (
                  <span className="text-text-muted ml-auto">{testResult.time}ms</span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 提示信息 */}
        <section className="text-xs text-text-muted space-y-2 pb-8">
          <div className="flex items-start gap-2">
            <Zap size={12} className="mt-0.5 text-amber-500 shrink-0" />
            <span>选择预设会自动填充 Base URL 和模型名，你只需输入 API Key 即可。</span>
          </div>
          <div className="flex items-start gap-2">
            <Zap size={12} className="mt-0.5 text-amber-500 shrink-0" />
            <span>支持所有 OpenAI 兼容格式的 API，包括 Moonshot、智谱、零一万物等。</span>
          </div>
        </section>

        {/* 全局消息 */}
        {message && (
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm animate-fade-in ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}
