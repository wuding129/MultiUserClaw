import { Bell, Settings, LogOut, Check } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { ping, logout, getUnreadCount, listNotifications, markNotificationsAsRead, markAllNotificationsAsRead, type Notification } from '../lib/api'

export default function TopBar() {
  const [online, setOnline] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => ping().then(() => setOnline(true)).catch(() => setOnline(false))
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  // Poll for unread count
  useEffect(() => {
    const fetchUnread = () => getUnreadCount().then(r => setUnreadCount(r.count)).catch(() => {})
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleShowNotifications = async () => {
    if (!showNotifications) {
      setLoadingNotifications(true)
      try {
        const list = await listNotifications(true)
        setNotifications(list)
      } catch (err) {
        console.error('Failed to load notifications:', err)
      } finally {
        setLoadingNotifications(false)
      }
    }
    setShowNotifications(!showNotifications)
  }

  const handleMarkAsRead = async (ids: string[]) => {
    await markNotificationsAsRead(ids)
    setUnreadCount(prev => Math.max(0, prev - ids.length))
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)))
  }

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsAsRead()
    setUnreadCount(0)
    setNotifications([])
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    return `${days}天前`
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-dark-border bg-dark-sidebar px-6">
      <div />

      {/* Right side */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
          online
            ? 'border border-accent-green/30 text-accent-green'
            : 'border border-accent-red/30 text-accent-red'
        }`}>
          <span className={`h-2 w-2 rounded-full ${
            online ? 'bg-accent-green' : 'bg-accent-red'
          }`} />
          {online ? '服务运行中' : '服务离线'}
        </div>

        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleShowNotifications}
            className="relative text-dark-text-secondary hover:text-dark-text"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-red text-[10px] text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-dark-border bg-dark-card shadow-xl">
              <div className="flex items-center justify-between border-b border-dark-border p-3">
                <span className="font-medium text-dark-text">通知</span>
                {notifications.length > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-accent-blue hover:underline"
                  >
                    全部已读
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {loadingNotifications ? (
                  <div className="p-4 text-center text-dark-text-secondary">加载中...</div>
                ) : notifications.length === 0 ? (
                  <div className="p-4 text-center text-dark-text-secondary">暂无新通知</div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className="border-b border-dark-border p-3 last:border-0 hover:bg-dark-bg transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-dark-text">{n.title}</div>
                          <div className="text-xs text-dark-text-secondary mt-0.5 line-clamp-2">{n.content}</div>
                          <div className="text-xs text-dark-text-secondary mt-1">{formatTime(n.created_at)}</div>
                        </div>
                        <button
                          onClick={() => handleMarkAsRead([n.id])}
                          className="shrink-0 p-1 text-dark-text-secondary hover:text-dark-text"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button className="text-dark-text-secondary hover:text-dark-text">
          <Settings size={20} />
        </button>
        <button
          onClick={() => logout()}
          className="text-dark-text-secondary hover:text-accent-red transition-colors"
          title="退出登录"
        >
          <LogOut size={20} />
        </button>
      </div>
    </header>
  )
}
