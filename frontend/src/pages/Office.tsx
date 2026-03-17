import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Building2, Bot, RefreshCw } from 'lucide-react'
import { fetchJSON, getAccessToken } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentState {
  agent_id: string
  agent_name: string
  status: string
  emoji: string | null
  position: { x: number; y: number }
  last_activity: string
  current_task: string | null
}

interface OfficeData {
  user_id: string
  agents: AgentState[]
  updated_at: string
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  idle: { label: '空闲', color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
  writing: { label: '编写中', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  researching: { label: '研究中', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  executing: { label: '执行中', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  syncing: { label: '同步中', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  error: { label: '错误', color: 'text-red-400', bgColor: 'bg-red-500/20' },
}

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.idle
}

// ---------------------------------------------------------------------------
// Agent Avatar Component
// ---------------------------------------------------------------------------

function AgentAvatar({ agent }: { agent: AgentState }) {
  const statusConfig = getStatusConfig(agent.status)

  return (
    <div
      className="absolute transition-all duration-500 ease-out"
      style={{
        left: agent.position.x,
        top: agent.position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Avatar container */}
      <div className="relative flex flex-col items-center">
        {/* Status indicator */}
        <div
          className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-dark-card ${
            agent.status === 'idle' ? 'bg-gray-500' :
            agent.status === 'writing' ? 'bg-blue-500 animate-pulse' :
            agent.status === 'researching' ? 'bg-purple-500 animate-pulse' :
            agent.status === 'executing' ? 'bg-orange-500 animate-pulse' :
            agent.status === 'syncing' ? 'bg-cyan-500 animate-pulse' :
            agent.status === 'error' ? 'bg-red-500' :
            'bg-gray-500'
          }`}
        />

        {/* Emoji avatar */}
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dark-border bg-dark-card shadow-lg ${statusConfig.bgColor}`}>
          {agent.emoji ? (
            <span className="text-2xl">{agent.emoji}</span>
          ) : (
            <Bot className="text-dark-text-secondary" size={24} />
          )}
        </div>

        {/* Name label */}
        <div className="mt-2 max-w-[100px] text-center">
          <div className="truncate text-xs font-medium text-dark-text">
            {agent.agent_name}
          </div>
          <div className={`text-[10px] ${statusConfig.color}`}>
            {statusConfig.label}
          </div>
        </div>

        {/* Current task tooltip */}
        {agent.current_task && (
          <div className="absolute -bottom-12 left-1/2 z-10 w-max max-w-[200px] -translate-x-1/2 rounded-lg bg-dark-bg px-2 py-1 text-[10px] text-dark-text-secondary shadow-lg border border-dark-border opacity-0 hover:opacity-100 transition-opacity">
            {agent.current_task}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty Office Component
// ---------------------------------------------------------------------------

function EmptyOffice() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-dark-text-secondary">
      <Building2 size={64} className="mb-4 opacity-30" />
      <div className="text-lg font-medium">办公室空空如也</div>
      <div className="mt-1 text-sm">开始与 Agent 对话后，他们就会出现在这里</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Office Canvas Component
// ---------------------------------------------------------------------------

function OfficeCanvas({ agents }: { agents: AgentState[] }) {
  if (agents.length === 0) {
    return <EmptyOffice />
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-dark-border bg-dark-card/50">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(to right, #fff 1px, transparent 1px),
            linear-gradient(to bottom, #fff 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Office room decorations */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Desk area */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-dark-border/20 to-transparent" />

        {/* Meeting area */}
        <div className="absolute top-8 right-8 h-24 w-32 rounded-xl border border-dark-border/30 bg-dark-card/30" />
        <div className="absolute top-12 right-12 text-[10px] text-dark-text-secondary/30">会议室</div>

        {/* Break area */}
        <div className="absolute bottom-8 left-8 h-20 w-28 rounded-xl border border-dark-border/30 bg-dark-card/30" />
        <div className="absolute bottom-12 left-12 text-[10px] text-dark-text-secondary/30">休息区</div>
      </div>

      {/* Agents */}
      {agents.map((agent) => (
        <AgentAvatar key={agent.agent_id} agent={agent} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats Bar Component
// ---------------------------------------------------------------------------

function StatsBar({ agents }: { agents: AgentState[] }) {
  const statusCounts = agents.reduce((acc, agent) => {
    acc[agent.status] = (acc[agent.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex items-center gap-4 rounded-lg border border-dark-border bg-dark-card px-4 py-2">
      <div className="text-sm text-dark-text-secondary">
        共 <span className="font-medium text-dark-text">{agents.length}</span> 个 Agent
      </div>
      <div className="h-4 w-px bg-dark-border" />
      {Object.entries(statusCounts).map(([status, count]) => {
        const config = getStatusConfig(status)
        return (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${config.bgColor}`} />
            <span className="text-xs text-dark-text-secondary">
              {config.label} {count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Office Component
// ---------------------------------------------------------------------------

export default function Office() {
  const [office, setOffice] = useState<OfficeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch initial office data
  const fetchOffice = useCallback(async () => {
    try {
      const data = await fetchJSON<OfficeData>('/api/office')
      setOffice(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load office')
    } finally {
      setLoading(false)
    }
  }, [])

  // WebSocket connection for real-time updates
  const connectWebSocket = useCallback(() => {
    const token = getAccessToken()
    if (!token) return

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/office/ws?token=${encodeURIComponent(token)}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[office] WebSocket connected')
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'office_update') {
          setOffice(data.office)
        } else if (data.type === 'agent_update') {
          setOffice((prev) => {
            if (!prev) return prev
            const agents = prev.agents.map((a) =>
              a.agent_id === data.agent.agent_id ? data.agent : a
            )
            return { ...prev, agents }
          })
        } else if (data.type === 'pong') {
          // Pong response
        }
      } catch (err) {
        console.error('[office] Failed to parse WebSocket message:', err)
      }
    }

    ws.onclose = () => {
      console.log('[office] WebSocket disconnected')
      setConnected(false)

      // Reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket()
      }, 2000)
    }

    ws.onerror = (err) => {
      console.error('[office] WebSocket error:', err)
    }
  }, [])

  // Ping interval to keep connection alive
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping')
      }
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [])

  // Initial load and WebSocket connection
  useEffect(() => {
    fetchOffice()
    connectWebSocket()

    return () => {
      wsRef.current?.close()
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [fetchOffice, connectWebSocket])

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <Loader2 className="animate-spin text-dark-text-secondary" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-dark-text-secondary">
        <div className="text-lg text-red-400">{error}</div>
        <button
          onClick={fetchOffice}
          className="mt-4 rounded-lg border border-dark-border px-4 py-2 text-sm hover:bg-dark-card transition-colors"
        >
          重试
        </button>
      </div>
    )
  }

  const agents = office?.agents || []

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text flex items-center gap-2">
            <Building2 className="text-accent-blue" size={28} />
            办公室
          </h1>
          <p className="mt-1 text-sm text-dark-text-secondary">
            实时查看 Agent 工作状态
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-2 text-xs text-dark-text-secondary">
            <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            {connected ? '已连接' : '未连接'}
          </div>
          {/* Refresh button */}
          <button
            onClick={fetchOffice}
            className="flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-sm text-dark-text-secondary hover:bg-dark-card hover:text-dark-text transition-colors"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mb-4">
        <StatsBar agents={agents} />
      </div>

      {/* Office canvas */}
      <div className="flex-1 min-h-0">
        <OfficeCanvas agents={agents} />
      </div>
    </div>
  )
}
