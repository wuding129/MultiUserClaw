import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Trash2,
  AlertCircle,
  Settings,
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Save,
} from 'lucide-react'
import type {
  ChannelsStatusResult,
  ChannelAccountSnapshot,
} from '../lib/api'
import {
  getChannelsStatus,
  getConfiguredChannels,
  getChannelConfig,
  saveChannelConfig,
  deleteChannelConfig,
} from '../lib/api'

// Static channel catalog — always shown even if gateway returns empty
const CHANNEL_CATALOG: Array<{ id: string; label: string; description: string; icon: string }> = [
  { id: 'telegram', label: 'Telegram', description: '通过 Telegram Bot 接入', icon: '✈️' },
  { id: 'discord', label: 'Discord', description: '通过 Discord Bot 接入', icon: '🎮' },
  { id: 'whatsapp', label: 'WhatsApp', description: '通过 WhatsApp Web 或 Cloud API 接入', icon: '📱' },
  { id: 'slack', label: 'Slack', description: '通过 Slack Bot 接入工作区', icon: '💜' },
  { id: 'signal', label: 'Signal', description: '通过 signal-cli 接入', icon: '🔒' },
  { id: 'imessage', label: 'iMessage', description: '通过 macOS iMessage 接入', icon: '💬' },
  { id: 'web', label: 'Web', description: '内嵌网页对话框', icon: '🌐' },
  { id: 'googlechat', label: 'Google Chat', description: '通过 Google Chat API 接入', icon: '💚' },
  { id: 'msteams', label: 'Microsoft Teams', description: '通过 Teams Bot 接入', icon: '🟦' },
  { id: 'dingtalk', label: '钉钉', description: '通过钉钉机器人接入', icon: '📌' },
  { id: 'feishu', label: '飞书', description: '通过飞书机器人接入', icon: '📘' },
  { id: 'wecom', label: '企业微信', description: '通过企业微信机器人接入', icon: '💬' },
  { id: 'qqbot', label: 'QQ', description: '通过 QQ Bot 接入', icon: '🐧' },
  { id: 'line', label: 'LINE', description: '通过 LINE Messaging API 接入', icon: '🟢' },
  { id: 'nostr', label: 'Nostr', description: '通过 Nostr 协议接入', icon: '🟣' },
  { id: 'matrix', label: 'Matrix', description: '通过 Matrix 协议接入', icon: '🔷' },
  { id: 'irc', label: 'IRC', description: '通过 IRC 协议接入', icon: '📡' },
]

const CHANNEL_ICONS: Record<string, string> = Object.fromEntries(
  CHANNEL_CATALOG.map((ch) => [ch.id, ch.icon]),
)

// Known channel config fields for common channels
const CHANNEL_CONFIG_FIELDS: Record<string, Array<{ key: string; label: string; type: 'text' | 'password' | 'boolean'; hint?: string }>> = {
  telegram: [
    { key: 'token', label: 'Bot Token', type: 'password', hint: '从 @BotFather 获取' },
    { key: 'allowFrom', label: '允许的用户', type: 'text', hint: '逗号分隔的用户名列表' },
  ],
  discord: [
    { key: 'token', label: 'Bot Token', type: 'password', hint: 'Discord Bot Token' },
    { key: 'allowFrom', label: '允许的用户', type: 'text', hint: '逗号分隔的用户ID' },
  ],
  slack: [
    { key: 'botToken', label: 'Bot Token', type: 'password', hint: 'xoxb-...' },
    { key: 'appToken', label: 'App Token', type: 'password', hint: 'xapp-...' },
    { key: 'allowFrom', label: '允许的用户', type: 'text', hint: '逗号分隔的用户ID' },
  ],
  whatsapp: [
    { key: 'mode', label: '模式', type: 'text', hint: 'web 或 cloud' },
    { key: 'allowFrom', label: '允许的号码', type: 'text', hint: '逗号分隔' },
  ],
  signal: [
    { key: 'cliPath', label: 'signal-cli 路径', type: 'text', hint: '/usr/local/bin/signal-cli' },
    { key: 'allowFrom', label: '允许的号码', type: 'text', hint: '逗号分隔' },
  ],
  googlechat: [
    { key: 'credentialsPath', label: '凭证文件路径', type: 'text' },
  ],
  msteams: [
    { key: 'appId', label: 'App ID', type: 'text' },
    { key: 'appPassword', label: 'App Password', type: 'password' },
  ],
  web: [
    { key: 'enabled', label: '启用', type: 'boolean' },
  ],
}

export default function Channels() {
  const [status, setStatus] = useState<ChannelsStatusResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Config modal state
  const [configChannel, setConfigChannel] = useState<string | null>(null)
  const [configData, setConfigData] = useState<Record<string, unknown>>({})
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)

  // Expanded account details
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Channels configured in openclaw.json (may not have gateway accounts yet)
  const [configuredTypes, setConfiguredTypes] = useState<string[]>([])

  const fetchStatus = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [statusResult, configuredResult] = await Promise.all([
        getChannelsStatus(),
        getConfiguredChannels(),
      ])
      setStatus(statusResult)
      if (configuredResult.success && configuredResult.channels) {
        setConfiguredTypes(configuredResult.channels)
      }
    } catch (err: any) {
      setError(err?.message || '获取渠道状态失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus(true)
  }, [fetchStatus])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchStatus()
  }

  const openConfig = async (channelType: string) => {
    setConfigChannel(channelType)
    setConfigLoading(true)
    try {
      const result = await getChannelConfig(channelType)
      setConfigData(result.config || {})
    } catch {
      setConfigData({})
    } finally {
      setConfigLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!configChannel) return
    setConfigSaving(true)
    try {
      await saveChannelConfig(configChannel, configData)
      setConfigChannel(null)
      // Refresh status after config change
      await fetchStatus()
    } catch (err: any) {
      setError(err?.message || '保存配置失败')
    } finally {
      setConfigSaving(false)
    }
  }

  const handleDeleteChannel = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteChannelConfig(deleteTarget)
      setConfiguredTypes((prev) => prev.filter((t) => t !== deleteTarget))
      setDeleteTarget(null)
      await fetchStatus()
    } catch (err: any) {
      setError(err?.message || '删除渠道失败')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-accent-blue" />
      </div>
    )
  }

  // Build channel list from status data + config + static catalog
  const channelAccounts = status?.channelAccounts || {}
  const channelLabels = status?.channelLabels || {}

  // Channels with gateway accounts (actively running/configured in gateway)
  const gatewayChannels = (status?.channelOrder || []).filter(
    (ch) => channelAccounts[ch] && channelAccounts[ch].length > 0,
  )

  // Merge: channels from gateway + channels configured in openclaw.json
  const allConfiguredIds = new Set([...gatewayChannels, ...configuredTypes])
  const configuredChannels = Array.from(allConfiguredIds)

  // Available = static catalog entries not yet configured
  const availableChannels = CHANNEL_CATALOG.filter(
    (ch) => !allConfiguredIds.has(ch.id),
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">渠道管理</h1>
          <p className="mt-1 text-sm text-dark-text-secondary">
            管理 AI Agent 的消息接入渠道
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text-secondary hover:text-dark-text transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Configured channels */}
      {configuredChannels.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-dark-text-secondary uppercase tracking-wider mb-3">
            已接入渠道
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configuredChannels.map((channelId) => {
              const accounts = channelAccounts[channelId] || []
              const catalogEntry = CHANNEL_CATALOG.find((c) => c.id === channelId)
              const label = channelLabels[channelId] || catalogEntry?.label || channelId
              const icon = CHANNEL_ICONS[channelId] || catalogEntry?.icon || '💬'
              const isExpanded = expandedChannel === channelId

              return (
                <div
                  key={channelId}
                  className="rounded-xl border border-dark-border bg-dark-card overflow-hidden"
                >
                  {/* Channel header */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-bg text-xl">
                        {icon}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-dark-text">{label}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {accounts.length > 0 ? (
                            accounts.map((acc) => (
                              <AccountStatusBadge key={acc.accountId} account={acc} />
                            ))
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-dark-text-secondary">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400" />
                              已配置（需重启网关生效）
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openConfig(channelId)}
                        className="rounded-lg p-1.5 text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg transition-colors"
                        title="配置"
                      >
                        <Settings size={15} />
                      </button>
                      <button
                        onClick={() => setExpandedChannel(isExpanded ? null : channelId)}
                        className="rounded-lg p-1.5 text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg transition-colors"
                        title="详情"
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(channelId)}
                        className="rounded-lg p-1.5 text-dark-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded account details */}
                  {isExpanded && (
                    <div className="border-t border-dark-border bg-dark-bg/30 px-4 py-3">
                      {accounts.map((acc) => (
                        <AccountDetail key={acc.accountId} account={acc} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available channels (not yet configured) */}
      {availableChannels.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-dark-text-secondary uppercase tracking-wider mb-3">
            可用渠道
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => openConfig(ch.id)}
                className="flex items-center gap-3 rounded-xl border border-dark-border bg-dark-card p-4 text-left hover:bg-dark-bg/50 transition-colors group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-bg text-xl opacity-50 group-hover:opacity-80 transition-opacity">
                  {ch.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-dark-text">{ch.label}</div>
                  <div className="text-xs text-dark-text-secondary mt-0.5 truncate">
                    {ch.description}
                  </div>
                </div>
                <Plus size={16} className="text-dark-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No channels at all (shouldn't happen with static catalog, but just in case) */}
      {configuredChannels.length === 0 && availableChannels.length === 0 && !error && (
        <div className="text-center py-20 text-dark-text-secondary text-sm">
          加载中...
        </div>
      )}

      {/* Config modal */}
      {configChannel && (
        <ChannelConfigModal
          channelType={configChannel}
          channelLabel={channelLabels[configChannel] || CHANNEL_CATALOG.find((c) => c.id === configChannel)?.label || configChannel}
          configData={configData}
          loading={configLoading}
          saving={configSaving}
          onConfigChange={setConfigData}
          onSave={handleSaveConfig}
          onClose={() => setConfigChannel(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-xl bg-dark-card border border-dark-border p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-base font-semibold text-dark-text mb-2">确认删除</h3>
            <p className="text-sm text-dark-text-secondary mb-4">
              确定要删除渠道 <span className="font-medium text-dark-text">{channelLabels[deleteTarget] || CHANNEL_CATALOG.find((c) => c.id === deleteTarget)?.label || deleteTarget}</span> 的配置？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-dark-border px-4 py-1.5 text-sm text-dark-text-secondary hover:text-dark-text transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeleteChannel}
                disabled={deleting}
                className="rounded-lg bg-accent-red px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-red/90 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Sub components ---

function AccountStatusBadge({ account }: { account: ChannelAccountSnapshot }) {
  const isConnected = account.connected
  const isRunning = account.running
  const hasError = !!account.lastError

  let color = 'bg-gray-500'
  let label = '未知'

  if (hasError) {
    color = 'bg-accent-red'
    label = '错误'
  } else if (isConnected) {
    color = 'bg-accent-green'
    label = '已连接'
  } else if (isRunning) {
    color = 'bg-accent-yellow animate-pulse'
    label = '连接中'
  } else if (account.configured) {
    color = 'bg-gray-400'
    label = '已配置'
  } else {
    label = '未配置'
  }

  return (
    <span className="flex items-center gap-1 text-xs text-dark-text-secondary">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />
      {account.name || account.accountId}: {label}
    </span>
  )
}

function AccountDetail({ account }: { account: ChannelAccountSnapshot }) {
  const fields: Array<[string, unknown]> = []

  if (account.name) fields.push(['名称', account.name])
  fields.push(['账户 ID', account.accountId])
  if (account.mode) fields.push(['模式', account.mode])
  if (account.enabled !== undefined && account.enabled !== null) fields.push(['启用', account.enabled ? '是' : '否'])
  if (account.configured !== undefined && account.configured !== null) fields.push(['已配置', account.configured ? '是' : '否'])
  if (account.connected !== undefined && account.connected !== null) fields.push(['已连接', account.connected ? '是' : '否'])
  if (account.running !== undefined && account.running !== null) fields.push(['运行中', account.running ? '是' : '否'])
  if (account.webhookUrl) fields.push(['Webhook', account.webhookUrl])
  if (account.lastConnectedAt) fields.push(['上次连接', new Date(account.lastConnectedAt).toLocaleString()])
  if (account.lastError) fields.push(['错误', account.lastError])
  if (account.reconnectAttempts) fields.push(['重连次数', account.reconnectAttempts])

  return (
    <div className="mb-3 last:mb-0">
      <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
        {fields.map(([label, value]) => (
          <div key={label as string} className="contents">
            <span className="text-dark-text-secondary font-medium">{label as string}</span>
            <span className={`text-dark-text truncate ${label === '错误' ? 'text-accent-red' : ''}`}>
              {String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface ChannelConfigModalProps {
  channelType: string
  channelLabel: string
  configData: Record<string, unknown>
  loading: boolean
  saving: boolean
  onConfigChange: (data: Record<string, unknown>) => void
  onSave: () => void
  onClose: () => void
}

function ChannelConfigModal({
  channelType,
  channelLabel,
  configData,
  loading,
  saving,
  onConfigChange,
  onSave,
  onClose,
}: ChannelConfigModalProps) {
  const knownFields = CHANNEL_CONFIG_FIELDS[channelType]

  const updateField = (key: string, value: unknown) => {
    onConfigChange({ ...configData, [key]: value })
  }

  // For channels without predefined fields, allow raw JSON editing
  const [rawMode, setRawMode] = useState(!knownFields)
  const [rawJson, setRawJson] = useState(JSON.stringify(configData, null, 2))

  useEffect(() => {
    if (!knownFields) {
      setRawJson(JSON.stringify(configData, null, 2))
    }
  }, [configData, knownFields])

  const handleRawSave = () => {
    try {
      const parsed = JSON.parse(rawJson)
      onConfigChange(parsed)
      // Small delay so state updates, then save
      setTimeout(() => onSave(), 50)
    } catch {
      alert('JSON 格式错误')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-xl bg-dark-card border border-dark-border max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{CHANNEL_ICONS[channelType] || '💬'}</span>
            <h3 className="text-base font-semibold text-dark-text">
              配置 {channelLabel}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-accent-blue" />
            </div>
          ) : rawMode ? (
            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                JSON 配置
              </label>
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text font-mono outline-none focus:border-accent-blue placeholder:text-dark-text-secondary resize-none"
                placeholder="{}"
              />
              {knownFields && (
                <button
                  onClick={() => setRawMode(false)}
                  className="mt-2 text-xs text-accent-blue hover:underline"
                >
                  切换到表单模式
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {knownFields?.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                    {field.label}
                  </label>
                  {field.type === 'boolean' ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!configData[field.key]}
                        onChange={(e) => updateField(field.key, e.target.checked)}
                        className="rounded border-dark-border"
                      />
                      <span className="text-sm text-dark-text">
                        {configData[field.key] ? '启用' : '禁用'}
                      </span>
                    </label>
                  ) : (
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={
                        Array.isArray(configData[field.key])
                          ? (configData[field.key] as string[]).join(', ')
                          : (configData[field.key] as string) || ''
                      }
                      onChange={(e) => {
                        const val = e.target.value
                        // Convert comma-separated to array for allowFrom fields
                        if (field.key === 'allowFrom' && val.includes(',')) {
                          updateField(field.key, val.split(',').map((s) => s.trim()).filter(Boolean))
                        } else {
                          updateField(field.key, val)
                        }
                      }}
                      placeholder={field.hint}
                      className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
                    />
                  )}
                  {field.hint && field.type !== 'boolean' && (
                    <p className="mt-0.5 text-[11px] text-dark-text-secondary">{field.hint}</p>
                  )}
                </div>
              ))}
              <button
                onClick={() => {
                  setRawJson(JSON.stringify(configData, null, 2))
                  setRawMode(true)
                }}
                className="text-xs text-accent-blue hover:underline"
              >
                切换到 JSON 模式
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-dark-border shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-dark-border px-4 py-1.5 text-sm text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            取消
          </button>
          <button
            onClick={rawMode ? handleRawSave : onSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent-blue px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
