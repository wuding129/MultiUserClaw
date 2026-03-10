import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Loader2 } from 'lucide-react'
import { createNewAgent } from '../store/agents'

export default function AgentCreate() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    workspace: '',
  })

  const workspaceName = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    setLoading(true)
    setError('')

    try {
      const workspace = form.workspace.trim() || undefined
      await createNewAgent(workspaceName, workspace)
      navigate('/agents')
    } catch (err: any) {
      setError(err?.message || '创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={() => navigate('/agents')}
        className="mb-6 flex items-center gap-2 text-sm text-dark-text-secondary hover:text-dark-text"
      >
        <ArrowLeft size={16} />
        返回 Agent 列表
      </button>

      <div className="rounded-xl border border-dark-border bg-dark-card p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-blue">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-dark-text">新建 Agent</h1>
            <p className="text-sm text-dark-text-secondary">配置并创建新的 AI Agent</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark-text">Agent 名称 *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="例如：Customer-Support-01"
              className="w-full rounded-lg border border-dark-border bg-dark-bg px-4 py-2.5 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
            />
          </div>

          {/* Workspace */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark-text">工作区路径</label>
            <input
              type="text"
              value={form.workspace}
              onChange={e => setForm(f => ({ ...f, workspace: e.target.value }))}
              placeholder={`留空则自动生成：~/.openclaw/workspace-${workspaceName || '<name>'}`}
              className="w-full rounded-lg border border-dark-border bg-dark-bg px-4 py-2.5 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
            />
          </div>

          {/* Info box */}
          <div className="rounded-lg bg-accent-blue/10 p-4 text-sm text-accent-blue">
            创建后将调用：<code className="rounded bg-dark-bg px-1.5 py-0.5 text-xs">
              agents.create(name: "{workspaceName || '<name>'}"
              {form.workspace.trim() ? `, workspace: "${form.workspace.trim()}"` : ''})
            </code>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !form.name.trim()}
              className="flex items-center gap-2 rounded-lg bg-accent-blue px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              创建 Agent
            </button>
            <button
              type="button"
              onClick={() => navigate('/agents')}
              className="rounded-lg border border-dark-border px-6 py-2.5 text-sm text-dark-text-secondary hover:text-dark-text transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
