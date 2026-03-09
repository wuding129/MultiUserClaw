import { CheckCircle, XCircle, Settings } from 'lucide-react'

const channels = [
  { name: '企业微信', status: 'connected', agents: 2, icon: '💬' },
  { name: '飞书', status: 'connected', agents: 1, icon: '📘' },
  { name: '钉钉', status: 'connected', agents: 1, icon: '📌' },
  { name: 'Slack', status: 'connected', agents: 1, icon: '💜' },
  { name: 'Telegram', status: 'disconnected', agents: 0, icon: '✈️' },
  { name: 'Discord', status: 'disconnected', agents: 0, icon: '🎮' },
  { name: '内嵌对话框', status: 'connected', agents: 1, icon: '🖥️' },
  { name: 'WhatsApp', status: 'disconnected', agents: 0, icon: '📱' },
]

export default function Channels() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark-text">渠道管理</h1>
        <p className="mt-1 text-sm text-dark-text-secondary">管理 AI Agent 的接入渠道</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {channels.map(ch => (
          <div key={ch.name} className="flex items-center justify-between rounded-xl border border-dark-border bg-dark-card p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dark-bg text-2xl">
                {ch.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-dark-text">{ch.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                  {ch.status === 'connected' ? (
                    <span className="flex items-center gap-1 text-accent-green">
                      <CheckCircle size={12} /> 已连接
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-dark-text-secondary">
                      <XCircle size={12} /> 未连接
                    </span>
                  )}
                  <span className="text-dark-text-secondary">· {ch.agents} 个 Agent 接入</span>
                </div>
              </div>
            </div>
            <button className="rounded-lg border border-dark-border p-2 text-dark-text-secondary hover:text-dark-text transition-colors">
              <Settings size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
