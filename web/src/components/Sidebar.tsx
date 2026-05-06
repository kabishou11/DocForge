import { FileText, LayoutTemplate, History, Settings, Sparkles } from 'lucide-react'

interface SidebarProps {
  currentView: string
  onViewChange: (view: 'generate' | 'templates' | 'history' | 'config') => void
}

const navItems = [
  { id: 'generate' as const, icon: Sparkles, label: '生成' },
  { id: 'templates' as const, icon: LayoutTemplate, label: '模板' },
  { id: 'history' as const, icon: History, label: '历史' },
  { id: 'config' as const, icon: Settings, label: '设置' },
]

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-[60px] flex flex-col items-center py-4 bg-bg-sidebar border-r border-border-primary shrink-0">
      {/* Logo */}
      <div className="mb-6">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
          <FileText size={17} className="text-white" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1.5 flex-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-all duration-200 group
                ${isActive
                  ? 'bg-amber-50 text-accent shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover'
                }`}
              title={item.label}
            >
              <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full" />
              )}
              {/* Tooltip */}
              <span className="absolute left-full ml-2.5 px-2.5 py-1 bg-text-primary text-white text-[11px] font-medium rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg z-50">
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Avatar */}
      <div className="mt-auto pt-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-200 to-amber-300 border-2 border-white shadow-sm flex items-center justify-center">
          <span className="text-[11px] text-amber-800 font-semibold">D</span>
        </div>
      </div>
    </aside>
  )
}
