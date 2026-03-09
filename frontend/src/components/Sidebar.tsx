import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { getMe } from '../lib/api'
import type { AuthUser } from '../lib/api'
import {
  LayoutDashboard,
  Bot,
  Zap,
  Radio,
  Brain,
  BookOpen,
  MessageSquare,
  FileText,
  Settings,
  User,
} from 'lucide-react'

const navSections = [
  {
    label: '概览',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: '仪表盘' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { to: '/agents', icon: Bot, label: 'Agents', badge: 6 },
    ],
  },
  {
    label: '技能中心',
    items: [
      { to: '/skills', icon: Zap, label: '技能商店' },
      { to: '/channels', icon: Radio, label: '渠道管理' },
      { to: '/models', icon: Brain, label: 'AI 模型' },
      { to: '/knowledge', icon: BookOpen, label: '知识库' },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/sessions', icon: MessageSquare, label: '会话历史' },
      { to: '/audit', icon: FileText, label: '审计日志' },
      { to: '/settings', icon: Settings, label: '系统设置' },
    ],
  },
]

export default function Sidebar() {
  const location = useLocation()
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    getMe().then(setUser).catch(() => {})
  }, [])

  return (
    <aside className="flex w-56 flex-col bg-dark-sidebar border-r border-dark-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue text-sm font-bold text-white">
          OC
        </div>
        <div>
          <div className="text-sm font-semibold text-dark-text">OpenClaw AI</div>
          <div className="text-xs text-dark-text-secondary">Multi User OpenClaw v2026.3</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navSections.map(section => (
          <div key={section.label} className="mb-4">
            <div className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wider text-dark-text-secondary">
              {section.label}
            </div>
            {section.items.map(item => {
              const Icon = item.icon
              const isActive = location.pathname === item.to ||
                (item.to !== '/dashboard' && location.pathname.startsWith(item.to))
              const isDisabled = item.to === '/knowledge' || item.to === '/settings'

              if (isDisabled) {
                return (
                  <div
                    key={item.to}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-dark-text-secondary/50 cursor-not-allowed"
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </div>
                )
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-accent-blue/15 text-accent-blue'
                      : 'text-dark-text-secondary hover:bg-dark-card hover:text-dark-text'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {'badge' in item && item.badge && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-accent-red text-xs text-white">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-dark-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-purple text-sm font-medium text-white">
            <User size={16} />
          </div>
          <div>
            <div className="text-sm font-medium text-dark-text">{user?.username ?? 'Admin'}</div>
            <div className="text-xs text-dark-text-secondary">{user?.email ?? ''}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
