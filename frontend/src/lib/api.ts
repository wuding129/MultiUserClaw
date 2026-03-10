// API client for OpenClaw Platform Gateway (multi-tenant mode)

const API_URL = import.meta.env.VITE_API_URL || ''

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface AuthUser {
  id: string
  username: string
  email: string
  role: string
  created_at: string
}

export interface AgentInfo {
  id: string
  name: string
  identity?: {
    name?: string
    emoji?: string
    avatar?: string
    theme?: string
    avatarUrl?: string
  }
}

export interface AgentListResult {
  defaultId: string
  mainKey: string
  scope: string
  agents: AgentInfo[]
}

export interface AgentFileEntry {
  name: string
  path: string
  missing: boolean
  size: number
  updatedAtMs: number
}

export interface AgentFilesResult {
  agentId: string
  workspace: string
  files: AgentFileEntry[]
}

export interface AgentFileContent {
  agentId: string
  workspace: string
  file: { name: string; content: string }
}

export interface Session {
  key: string
  title?: string
  created_at: string | null
  updated_at: string | null
}

export interface SessionDetail {
  key: string
  messages: Array<{
    role: string
    content: string
    timestamp: string | null
  }>
  created_at: string | null
  updated_at: string | null
}

export interface Skill {
  name: string
  description: string
  source?: string
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_KEY = 'openclaw_access_token'
const REFRESH_TOKEN_KEY = 'openclaw_refresh_token'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access)
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
}

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null
}

// ---------------------------------------------------------------------------
// Core HTTP helper
// ---------------------------------------------------------------------------

let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false

  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!res.ok) return false
      const data: TokenResponse = await res.json()
      setTokens(data.access_token, data.refresh_token)
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function fetchJSON<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers })

  // On 401 attempt a silent token refresh and retry once
  if (res.status === 401 && token) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getAccessToken()}`
      res = await fetch(`${API_URL}${path}`, { ...options, headers })
    } else {
      clearTokens()
      window.location.href = '/login'
      throw new Error('Session expired')
    }
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Auth functions
// ---------------------------------------------------------------------------

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<TokenResponse> {
  const data = await fetchJSON<TokenResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  })
  setTokens(data.access_token, data.refresh_token)
  return data
}

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  const data = await fetchJSON<TokenResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setTokens(data.access_token, data.refresh_token)
  return data
}

export function logout(): void {
  clearTokens()
  window.location.href = '/login'
}

export async function getMe(): Promise<AuthUser> {
  return fetchJSON<AuthUser>('/api/auth/me')
}

// ---------------------------------------------------------------------------
// Agent functions
// ---------------------------------------------------------------------------

export async function listAgents(): Promise<AgentListResult> {
  return fetchJSON<AgentListResult>('/api/openclaw/agents')
}

export async function createAgent(
  name: string,
  workspace?: string,
): Promise<AgentInfo> {
  return fetchJSON<AgentInfo>('/api/openclaw/agents', {
    method: 'POST',
    body: JSON.stringify({ name, workspace }),
  })
}

export async function updateAgent(
  agentId: string,
  updates: { name?: string; workspace?: string; model?: string; avatar?: string },
): Promise<Record<string, unknown>> {
  return fetchJSON<Record<string, unknown>>(`/api/openclaw/agents/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteAgent(
  agentId: string,
  deleteFiles?: boolean,
): Promise<void> {
  const params = deleteFiles ? '?delete_files=true' : ''
  await fetchJSON<unknown>(`/api/openclaw/agents/${encodeURIComponent(agentId)}${params}`, {
    method: 'DELETE',
  })
}

export async function listAgentFiles(
  agentId: string,
): Promise<AgentFilesResult> {
  return fetchJSON<AgentFilesResult>(`/api/openclaw/agents/${encodeURIComponent(agentId)}/files`)
}

export async function getAgentFile(
  agentId: string,
  name: string,
): Promise<AgentFileContent> {
  return fetchJSON<AgentFileContent>(`/api/openclaw/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(name)}`)
}

export async function setAgentFile(
  agentId: string,
  name: string,
  content: string,
): Promise<void> {
  await fetchJSON<unknown>(
    `/api/openclaw/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ content }),
    },
  )
}

// ---------------------------------------------------------------------------
// Session functions
// ---------------------------------------------------------------------------

export async function listSessions(): Promise<Session[]> {
  return fetchJSON<Session[]>('/api/openclaw/sessions')
}

export async function getSession(key: string): Promise<SessionDetail> {
  return fetchJSON<SessionDetail>(`/api/openclaw/sessions/${encodeURIComponent(key)}`)
}

export async function deleteSession(key: string): Promise<void> {
  await fetchJSON<unknown>(`/api/openclaw/sessions/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Chat functions
// ---------------------------------------------------------------------------

export async function sendChatMessage(
  sessionKey: string,
  message: string,
): Promise<{ ok: boolean; runId: string | null }> {
  return fetchJSON<{ ok: boolean; runId: string | null }>(
    `/api/openclaw/sessions/${encodeURIComponent(sessionKey)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    },
  )
}

// ---------------------------------------------------------------------------
// Other
// ---------------------------------------------------------------------------

export async function listSkills(): Promise<Skill[]> {
  return fetchJSON<Skill[]>('/api/openclaw/skills')
}

export async function getStatus(): Promise<Record<string, unknown>> {
  return fetchJSON<Record<string, unknown>>('/api/openclaw/status')
}

export async function ping(): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/ping`)
  if (!res.ok) throw new Error(`Ping failed: ${res.status}`)
  return res.json()
}
