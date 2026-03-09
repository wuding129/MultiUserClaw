import { useState, useEffect } from 'react'
import { listSessions, deleteSession } from '../lib/api'
import type { Session } from '../lib/api'
import { Clock, Loader2, Trash2 } from 'lucide-react'

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSessions = () => {
    setLoading(true)
    listSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  const handleDelete = async (key: string) => {
    try {
      await deleteSession(key)
      fetchSessions()
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark-text">会话历史</h1>
        <p className="mt-1 text-sm text-dark-text-secondary">查看所有 Agent 的对话记录</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-accent-blue" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-dark-text-secondary">
          暂无会话记录
        </div>
      ) : (
        <div className="rounded-xl border border-dark-border bg-dark-card">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-dark-text-secondary border-b border-dark-border">
                <th className="px-6 py-3 font-medium">会话</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 font-medium">最近更新</th>
                <th className="px-4 py-3 font-medium text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.key} className="border-t border-dark-border/50 hover:bg-dark-card-hover transition-colors">
                  <td className="px-6 py-3 text-sm text-dark-text">
                    {s.title || s.key}
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-text-secondary">
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} />
                      {s.created_at || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-text-secondary">
                    {s.updated_at || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(s.key)}
                      className="text-dark-text-secondary hover:text-accent-red transition-colors"
                      title="删除会话"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
