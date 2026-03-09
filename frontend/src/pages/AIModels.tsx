import { Brain, CheckCircle, Zap } from 'lucide-react'

const models = [
  { name: 'Claude Opus 4.6', id: 'claude-opus-4-6', provider: 'Anthropic', status: 'active', speed: '慢', quality: '最高', agents: 1 },
  { name: 'Claude Sonnet 4.6', id: 'claude-sonnet-4-6', provider: 'Anthropic', status: 'active', speed: '快', quality: '高', agents: 3 },
  { name: 'Claude Haiku 4.5', id: 'claude-haiku-4-5-20251001', provider: 'Anthropic', status: 'active', speed: '极快', quality: '中', agents: 2 },
  { name: 'GPT-4o', id: 'gpt-4o', provider: 'OpenAI', status: 'active', speed: '快', quality: '高', agents: 0 },
  { name: 'GPT-4o Mini', id: 'gpt-4o-mini', provider: 'OpenAI', status: 'active', speed: '极快', quality: '中', agents: 0 },
  { name: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro', provider: 'Google', status: 'inactive', speed: '快', quality: '高', agents: 0 },
  { name: 'DeepSeek V3', id: 'deepseek-v3', provider: 'DeepSeek', status: 'active', speed: '快', quality: '高', agents: 0 },
  { name: 'Qwen 3', id: 'qwen-3', provider: 'Alibaba', status: 'inactive', speed: '快', quality: '中高', agents: 0 },
]

export default function AIModels() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark-text">AI 模型</h1>
        <p className="mt-1 text-sm text-dark-text-secondary">管理可用的 AI 模型连接</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {models.map(model => (
          <div key={model.id} className="rounded-xl border border-dark-border bg-dark-card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-purple/10">
                  <Brain size={20} className="text-accent-purple" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-dark-text">{model.name}</div>
                  <div className="text-xs text-dark-text-secondary">{model.provider}</div>
                </div>
              </div>
              {model.status === 'active' ? (
                <span className="flex items-center gap-1 text-xs text-accent-green">
                  <CheckCircle size={12} /> 已连接
                </span>
              ) : (
                <span className="text-xs text-dark-text-secondary">未激活</span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-dark-text-secondary">
              <span className="flex items-center gap-1">
                <Zap size={12} /> 速度: {model.speed}
              </span>
              <span>质量: {model.quality}</span>
              <span>{model.agents} 个 Agent 使用</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
