import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, Bot, Loader2, StopCircle, User } from 'lucide-react'
import { getSession, sendChatMessage } from '../lib/api'

interface ChatMessage {
  role: string
  content: string
  timestamp: string | null
}

interface Props {
  agentId: string
  agentName: string
  agentEmoji?: string
  onClose: () => void
}

export default function ChatDrawer({ agentId, agentName, agentEmoji, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const sessionKey = `web-${agentId}`

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Load chat history
  const loadHistory = useCallback(async () => {
    try {
      const detail = await getSession(sessionKey)
      setMessages(detail.messages || [])
    } catch {
      // Session may not exist yet — that's ok
      setMessages([])
    }
  }, [sessionKey])

  // Initial load
  useEffect(() => {
    setLoading(true)
    loadHistory().finally(() => setLoading(false))
  }, [loadHistory])

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Focus input
  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const detail = await getSession(sessionKey)
        const msgs = detail.messages || []
        setMessages(msgs)
        // Stop polling when last message is from assistant (response complete)
        if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setSending(false)
        }
      } catch {
        // ignore polling errors
      }
    }, 1000)
  }, [sessionKey])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    // Optimistically add user message
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      await sendChatMessage(sessionKey, text)
      // Start polling for assistant response
      startPolling()
    } catch (err) {
      setSending(false)
      // Add error message
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `发送失败: ${(err as Error).message}`, timestamp: new Date().toISOString() },
      ])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-dark-border bg-dark-sidebar shadow-2xl"
      style={{ animation: 'slideInRight 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-dark-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark-bg">
            {agentEmoji ? (
              <span className="text-base">{agentEmoji}</span>
            ) : (
              <Bot size={16} className="text-accent-blue" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-dark-text">{agentName}</div>
            <div className="text-xs text-dark-text-secondary">在线对话</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-dark-text-secondary hover:bg-dark-card hover:text-dark-text transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="animate-spin text-dark-text-secondary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-dark-text-secondary">
            <Bot size={40} className="mb-3 opacity-50" />
            <p className="text-sm">开始与 {agentName} 对话</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                msg.role === 'user' ? 'bg-accent-blue' : 'bg-dark-bg'
              }`}>
                {msg.role === 'user' ? (
                  <User size={14} className="text-white" />
                ) : agentEmoji ? (
                  <span className="text-xs">{agentEmoji}</span>
                ) : (
                  <Bot size={14} className="text-accent-blue" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-accent-blue text-white'
                    : 'bg-dark-card text-dark-text border border-dark-border'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {sending && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dark-bg">
              {agentEmoji ? (
                <span className="text-xs">{agentEmoji}</span>
              ) : (
                <Bot size={14} className="text-accent-blue" />
              )}
            </div>
            <div className="rounded-xl bg-dark-card border border-dark-border px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-dark-text-secondary animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-dark-text-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-dark-text-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-dark-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送)"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
            style={{ maxHeight: '120px' }}
            disabled={sending}
          />
          <button
            onClick={sending ? undefined : handleSend}
            disabled={!input.trim() && !sending}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              sending
                ? 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30'
                : input.trim()
                  ? 'bg-accent-blue text-white hover:bg-accent-blue/90'
                  : 'bg-dark-card text-dark-text-secondary'
            }`}
          >
            {sending ? <StopCircle size={18} /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
