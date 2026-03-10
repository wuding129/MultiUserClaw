import { useState, useEffect } from 'react'
import {
  Users,
  Container,
  Trash2,
  User,
  Loader2,
  BarChart3,
  RefreshCw,
  Pause,
} from 'lucide-react'

interface UserSummary {
  id: string
  username: string
  email: string
  role: string
  quota_tier: string
  is_active: boolean
  container_status: string | null
  container_cpu: number | null
  container_memory: string | null
  container_memory_percent: number | null
  tokens_used_today: number
}

interface UsageSummary {
  total_tokens_today: number
  total_users: number
  active_containers: number
}

export default function Admin() {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('openclaw_access_token')
      const [usersRes, usageRes] = await Promise.all([
        fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()),
        fetch('/api/admin/usage/summary', {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()),
      ])
      setUsers(usersRes)
      setUsage(usageRes)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const updateRole = async (userId: string, role: string) => {
    const token = localStorage.getItem('openclaw_access_token')
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role }),
    })
    fetchData()
  }

  const deleteContainer = async (userId: string) => {
    if (!confirm('确定要删除该用户的容器吗？数据将保留但容器会被删除。')) return
    const token = localStorage.getItem('openclaw_access_token')
    await fetch(`/api/admin/users/${userId}/container`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchData()
  }

  const pauseContainer = async (userId: string) => {
    if (!confirm('确定要暂停该用户的容器吗？')) return
    const token = localStorage.getItem('openclaw_access_token')
    await fetch(`/api/admin/users/${userId}/container/pause`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-dark-text-secondary" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-accent-red/30 bg-accent-red/10 p-4 text-accent-red">
        <p>加载失败: {error}</p>
        <p className="text-sm text-accent-red/70 mt-2">请确保你有管理员权限</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">用户管理</h1>
          <p className="mt-1 text-sm text-dark-text-secondary">管理平台用户和容器</p>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新数据
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-dark-border bg-dark-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-blue">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-dark-text">{usage?.total_users ?? 0}</div>
              <div className="text-sm text-dark-text-secondary">注册用户</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-dark-border bg-dark-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-green">
              <Container size={20} className="text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-dark-text">{usage?.active_containers ?? 0}</div>
              <div className="text-sm text-dark-text-secondary">运行中容器</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-dark-border bg-dark-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-purple">
              <BarChart3 size={20} className="text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-dark-text">{((usage?.total_tokens_today ?? 0) / 1000).toFixed(1)}K</div>
              <div className="text-sm text-dark-text-secondary">今日 Token 消耗</div>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-dark-border bg-dark-card">
        <div className="flex items-center justify-between border-b border-dark-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-accent-blue" />
            <h2 className="text-base font-semibold text-dark-text">用户列表</h2>
          </div>
          <span className="text-sm text-dark-text-secondary">{users.length} 个用户</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-dark-text-secondary border-b border-dark-border">
                <th className="px-6 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">配额</th>
                <th className="px-4 py-3 font-medium">容器状态</th>
                <th className="px-4 py-3 font-medium">CPU</th>
                <th className="px-4 py-3 font-medium">内存</th>
                <th className="px-4 py-3 font-medium">今日用量</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b border-dark-border/50 hover:bg-dark-card-hover">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-purple">
                        <User size={16} className="text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-dark-text">{user.username}</div>
                        <div className="text-xs text-dark-text-secondary">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={user.role}
                      onChange={(e) => updateRole(user.id, e.target.value)}
                      className="rounded border border-dark-border bg-dark-bg px-2 py-1 text-sm text-dark-text"
                    >
                      <option value="user">用户</option>
                      <option value="admin">管理员</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      user.quota_tier === 'pro' ? 'bg-accent-purple/20 text-accent-purple' :
                      user.quota_tier === 'basic' ? 'bg-accent-blue/20 text-accent-blue' :
                      'bg-dark-text-secondary/20 text-dark-text-secondary'
                    }`}>
                      {user.quota_tier}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`flex items-center gap-1.5 text-xs ${
                      user.container_status === 'running' ? 'text-accent-green' :
                      user.container_status === 'paused' ? 'text-accent-yellow' :
                      user.container_status ? 'text-dark-text-secondary' : 'text-dark-text-secondary/50'
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${
                        user.container_status === 'running' ? 'bg-accent-green' :
                        user.container_status === 'paused' ? 'bg-accent-yellow' :
                        'bg-dark-text-secondary/50'
                      }`} />
                      {user.container_status || '无容器'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-dark-text-secondary">
                    {user.container_cpu !== null ? `${user.container_cpu.toFixed(1)}%` : '-'}
                  </td>
                  <td className="px-4 py-4 text-sm text-dark-text-secondary">
                    {user.container_memory !== null ? (
                      <span title={`内存使用率: ${user.container_memory_percent?.toFixed(1)}%`}>
                        {user.container_memory}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-4 text-sm text-dark-text-secondary">
                    {user.tokens_used_today.toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {user.container_status === 'running' && (
                        <button
                          onClick={() => pauseContainer(user.id)}
                          className="rounded p-1.5 text-dark-text-secondary hover:bg-dark-card hover:text-accent-yellow"
                          title="暂停容器"
                        >
                          <Pause size={16} />
                        </button>
                      )}
                      {user.container_status && (
                        <button
                          onClick={() => deleteContainer(user.id)}
                          className="rounded p-1.5 text-dark-text-secondary hover:bg-dark-card hover:text-accent-red"
                          title="删除容器"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
