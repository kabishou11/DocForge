import { useState, lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { Loader2 } from 'lucide-react'

// Lazy load non-critical panels for faster initial load
const ChatPanel = lazy(() => import('./components/ChatPanel').then(m => ({ default: m.ChatPanel })))
const TemplatePanel = lazy(() => import('./components/TemplatePanel').then(m => ({ default: m.TemplatePanel })))
const HistoryPanel = lazy(() => import('./components/HistoryPanel').then(m => ({ default: m.HistoryPanel })))
const ConfigPanel = lazy(() => import('./components/ConfigPanel').then(m => ({ default: m.ConfigPanel })))

type View = 'generate' | 'templates' | 'history' | 'config'

function LoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={24} className="text-accent animate-spin" />
    </div>
  )
}

function App() {
  const [currentView, setCurrentView] = useState<View>('generate')

  return (
    <div className="flex h-screen w-screen bg-bg-primary text-text-primary font-sans">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Suspense fallback={<LoadingFallback />}>
          {currentView === 'generate' && <ChatPanel />}
          {currentView === 'templates' && <TemplatePanel />}
          {currentView === 'history' && <HistoryPanel />}
          {currentView === 'config' && <ConfigPanel />}
        </Suspense>
      </main>
    </div>
  )
}

export default App
