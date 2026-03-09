import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bot,
  Settings,
  FileText,
  Loader2,
} from 'lucide-react'
import { fetchAgentDetail, fetchAgents, updateAgentSystemPrompt } from '../store/agents'
import type { BackendAgent, AgentFile } from '../types/agent'

interface AgentDetailData {
  agentId: string
  workspace: string
  files: AgentFile[]
  systemPrompt: string
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [agentInfo, setAgentInfo] = useState<BackendAgent | null>(null)
  const [detail, setDetail] = useState<AgentDetailData | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ systemPrompt: '' })

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetchAgentDetail(id),
      fetchAgents(),
    ]).then(([d, agents]) => {
      setDetail(d as AgentDetailData)
      const found = agents.find((a: BackendAgent) => a.id === id)
      setAgentInfo(found || null)
      setForm({ systemPrompt: d.systemPrompt || '' })
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-dark-text-secondary" size={32} /></div>

  if (!agentInfo && !detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Bot size={48} className="mb-4 text-dark-text-secondary" />
        <p className="text-dark-text-secondary">未找到该 Agent</p>
        <button
          onClick={() => navigate('/agents')}
          className="mt-4 text-sm text-accent-blue hover:underline"
        >
          返回列表
        </button>
      </div>
    )
  }

  const agentName = agentInfo?.name || id || ''
  const emoji = agentInfo?.identity?.emoji

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      await updateAgentSystemPrompt(id, form.systemPrompt)
      setDetail(prev => prev ? { ...prev, systemPrompt: form.systemPrompt } : prev)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="mx-auto max-w-4xl">
      <button
        onClick={() => navigate('/agents')}
        className="mb-6 flex items-center gap-2 text-sm text-dark-text-secondary hover:text-dark-text"
      >
        <ArrowLeft size={16} />
        返回 Agent 列表
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between rounded-xl border border-dark-border bg-dark-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-dark-bg">
            {emoji ? (
              <span className="text-2xl">{emoji}</span>
            ) : (
              <Bot size={28} className="text-accent-blue" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-dark-text">{agentName}</h1>
            <p className="text-sm text-dark-text-secondary">{id}</p>
          </div>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-2 rounded-lg border border-dark-border px-4 py-2 text-sm text-dark-text-secondary hover:text-dark-text transition-colors"
        >
          <Settings size={14} />
          配置
        </button>
      </div>

      {/* Workspace Info */}
      {detail?.workspace && (
        <div className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Settings size={16} className="text-dark-text-secondary" />
            <span className="text-sm font-medium text-dark-text">工作区路径</span>
          </div>
          <code className="text-sm text-dark-text-secondary">{detail.workspace}</code>
        </div>
      )}

      {/* Files */}
      {detail?.files && detail.files.length > 0 && (
        <div className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} className="text-dark-text-secondary" />
            <span className="text-sm font-medium text-dark-text">配置文件</span>
          </div>
          <div className="space-y-2">
            {detail.files.map(file => (
              <div key={file.name} className="flex items-center justify-between rounded-lg bg-dark-bg px-4 py-2">
                <span className={`text-sm ${file.missing ? 'text-dark-text-secondary line-through' : 'text-dark-text'}`}>
                  {file.name}
                </span>
                <span className="text-xs text-dark-text-secondary">
                  {file.missing ? '缺失' : formatSize(file.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Prompt / Edit */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-6">
        <h2 className="mb-4 text-base font-semibold text-dark-text">
          {editing ? '编辑系统提示词' : '系统提示词 (SOUL.md)'}
        </h2>

        {editing ? (
          <div className="space-y-4">
            <textarea
              value={form.systemPrompt}
              onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
              rows={10}
              className="w-full rounded-lg border border-dark-border bg-dark-bg px-4 py-2 text-sm text-dark-text outline-none focus:border-accent-blue resize-none font-mono"
            />
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                保存
              </button>
              <button
                onClick={() => { setEditing(false); setForm({ systemPrompt: detail?.systemPrompt || '' }) }}
                className="rounded-lg border border-dark-border px-4 py-2 text-sm text-dark-text-secondary hover:text-dark-text"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div>
            {detail?.systemPrompt ? (
              <pre className="whitespace-pre-wrap rounded-lg bg-dark-bg p-4 text-sm text-dark-text leading-relaxed font-mono">
                {detail.systemPrompt}
              </pre>
            ) : (
              <p className="text-sm text-dark-text-secondary">暂无系统提示词</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
