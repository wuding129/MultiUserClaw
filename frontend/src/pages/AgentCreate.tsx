import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Loader2, Cpu, Package } from 'lucide-react'
import { createNewAgent } from '../store/agents'
import { listModels, listCuratedSkills, type ModelChoice, type CuratedSkill } from '../lib/api'

// Convert display name to a valid agent ID (ASCII only, lowercase)
function toAgentId(name: string): string {
  // transliterate common CJK → pinyin-like slug is complex;
  // just strip non-ASCII and collapse to dashes
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 64)
  return id || ''
}

export default function AgentCreate() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [models, setModels] = useState<ModelChoice[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [curatedSkills, setCuratedSkills] = useState<CuratedSkill[]>([])
  const [curatedLoading, setCuratedLoading] = useState(true)
  const WORKSPACE_PREFIX = '~/.openclaw/workspace_'
  const [form, setForm] = useState({
    displayName: '',
    agentId: '',
    agentIdManual: false, // true if user has manually edited the ID
    workspaceSuffix: '',
    installedSkills: [] as string[], // skill IDs to install for this agent
    model: '', // selected model
  })

  // Fetch available models and curated skills on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [modelsResult, curated] = await Promise.all([
          listModels(),
          listCuratedSkills(),
        ])
        setModels(modelsResult.models)
        setCuratedSkills(curated.filter(s => s.installed === false)) // only show not installed
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setModelsLoading(false)
        setCuratedLoading(false)
      }
    }
    fetchData()
  }, [])

  const effectiveId = form.agentId || toAgentId(form.displayName)
  const hasValidId = /^[a-z0-9][a-z0-9_-]*$/.test(effectiveId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveId || !hasValidId) return

    setLoading(true)
    setError('')

    try {
      const suffix = form.workspaceSuffix.trim()
      const workspace = suffix ? `${WORKSPACE_PREFIX}${suffix}` : undefined
      await createNewAgent(effectiveId, workspace, form.installedSkills, form.model || undefined)
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
          {/* Display Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark-text">显示名称 *</label>
            <input
              type="text"
              required
              value={form.displayName}
              onChange={e => {
                const val = e.target.value
                setForm(f => ({
                  ...f,
                  displayName: val,
                  // Auto-sync agent ID if user hasn't manually edited it
                  ...(f.agentIdManual ? {} : { agentId: '' }),
                }))
              }}
              placeholder="例如：保险智能体、Customer Support"
              className="w-full rounded-lg border border-dark-border bg-dark-bg px-4 py-2.5 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
            />
          </div>

          {/* Agent ID */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark-text">Agent ID *</label>
            <input
              type="text"
              value={form.agentId || (form.agentIdManual ? '' : toAgentId(form.displayName))}
              onChange={e => setForm(f => ({ ...f, agentId: e.target.value, agentIdManual: true }))}
              placeholder="insurance-agent"
              className={`w-full rounded-lg border bg-dark-bg px-4 py-2.5 text-sm text-dark-text outline-none placeholder:text-dark-text-secondary ${
                effectiveId && !hasValidId
                  ? 'border-accent-red focus:border-accent-red'
                  : 'border-dark-border focus:border-accent-blue'
              }`}
            />
            <p className="mt-1 text-xs text-dark-text-secondary">
              仅支持小写字母、数字、下划线和连字符（a-z, 0-9, _, -）
              {form.displayName && !form.agentIdManual && !toAgentId(form.displayName) && (
                <span className="text-accent-yellow ml-1">— 请手动输入英文 ID</span>
              )}
            </p>
          </div>

          {/* Workspace */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark-text">工作区路径</label>
            <div className="flex items-center rounded-lg border border-dark-border bg-dark-bg overflow-hidden focus-within:border-accent-blue">
              <span className="shrink-0 px-3 py-2.5 text-sm text-dark-text-secondary select-none border-r border-dark-border bg-dark-card">
                {WORKSPACE_PREFIX}
              </span>
              <input
                type="text"
                value={form.workspaceSuffix}
                onChange={e => setForm(f => ({ ...f, workspaceSuffix: e.target.value }))}
                placeholder={effectiveId || '<agent-id>'}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-dark-text outline-none placeholder:text-dark-text-secondary"
              />
            </div>
            <p className="mt-1 text-xs text-dark-text-secondary">留空则自动生成</p>
          </div>

          {/* Model Selection */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark-text">
              <div className="flex items-center gap-2">
                <Cpu size={14} />
                选择模型
              </div>
            </label>
            {modelsLoading ? (
              <div className="flex items-center gap-2 text-sm text-dark-text-secondary">
                <Loader2 size={14} className="animate-spin" />
                加载中...
              </div>
            ) : models.length === 0 ? (
              <p className="text-sm text-dark-text-secondary">暂无可用模型</p>
            ) : (
              <select
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                className="w-full rounded-lg border border-dark-border bg-dark-bg px-4 py-2.5 text-sm text-dark-text outline-none focus:border-accent-blue"
              >
                <option value="">默认模型</option>
                {models.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-dark-text-secondary">
              留空使用平台默认模型
            </p>
          </div>

          {/* Install Curated Skills */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark-text">
              <div className="flex items-center gap-2">
                <Package size={14} />
                安装精选技能
              </div>
            </label>
            {curatedLoading ? (
              <div className="flex items-center gap-2 text-sm text-dark-text-secondary">
                <Loader2 size={14} className="animate-spin" />
                加载中...
              </div>
            ) : curatedSkills.length === 0 ? (
              <p className="text-sm text-dark-text-secondary">暂无可安装的精选技能</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-dark-border bg-dark-bg p-3 space-y-2">
                {curatedSkills.map(skill => (
                  <label
                    key={skill.id}
                    className="flex items-start gap-3 p-2 rounded hover:bg-dark-card cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={form.installedSkills.includes(skill.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setForm(f => ({
                            ...f,
                            installedSkills: [...f.installedSkills, skill.id]
                          }))
                        } else {
                          setForm(f => ({
                            ...f,
                            installedSkills: f.installedSkills.filter(s => s !== skill.id)
                          }))
                        }
                      }}
                      className="mt-1 w-4 h-4 rounded border-dark-border text-accent-blue focus:ring-accent-blue bg-dark-bg"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-dark-text">
                        {skill.name}
                        {skill.is_featured && (
                          <span className="ml-2 text-xs bg-accent-yellow/20 text-accent-yellow px-1.5 py-0.5 rounded">精选</span>
                        )}
                      </div>
                      {skill.description && (
                        <div className="text-xs text-dark-text-secondary truncate">{skill.description}</div>
                      )}
                      <div className="text-xs text-dark-text-secondary mt-0.5">
                        {skill.category} · {skill.install_count} 次安装
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-dark-text-secondary">
              选择要预装到此 Agent 的精选技能，安装后可单独启用/禁用
            </p>
          </div>

          {/* Info box */}
          <div className="rounded-lg bg-accent-blue/10 p-4 text-sm text-accent-blue">
            创建后将调用：<code className="rounded bg-dark-bg px-1.5 py-0.5 text-xs">
              agents.create(name: "{effectiveId || '<agent-id>'}"
              {form.workspaceSuffix.trim() ? `, workspace: "${WORKSPACE_PREFIX}${form.workspaceSuffix.trim()}"` : ''})
            </code>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !effectiveId || !hasValidId}
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
