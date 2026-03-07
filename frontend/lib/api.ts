// OpenClaw API client — multi-tenant edition
//
// In multi-tenant mode the frontend talks to the Platform Gateway.
// Auth requests go to /api/auth/*, openclaw requests are proxied via
// /api/openclaw/* to the user's container.

import type { ChatMessage, Session, SessionDetail, SystemStatus, CronJob, Skill, SlashCommand, PluginInfo, TokenResponse, AuthUser, FileAttachment, Marketplace, MarketplacePlugin } from '@/types';
// @ts-ignore - exports map requires .js extension
import { ed25519 } from '@noble/curves/ed25519.js';
// @ts-ignore - exports map requires .js extension
import { sha256 } from '@noble/hashes/sha2.js';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'openclaw_access_token';
const REFRESH_KEY = 'openclaw_refresh_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: authHeaders(),
    ...options,
  });

  if (res.status === 401) {
    // Try refresh
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry with new token
      const retry = await fetch(`${API_URL}${path}`, {
        headers: authHeaders(),
        ...options,
      });
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`API error ${retry.status}: ${text}`);
      }
      return retry.json();
    }
    // Refresh failed — force logout
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function tryRefreshToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data: TokenResponse = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export async function register(username: string, email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Registration failed' }));
    throw new Error(data.detail || 'Registration failed');
  }
  const data: TokenResponse = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(data.detail || 'Invalid credentials');
  }
  const data: TokenResponse = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export function logout(): void {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

export async function getMe(): Promise<AuthUser> {
  return fetchJSON('/api/auth/me');
}

// ---------------------------------------------------------------------------
// Chat (proxied via /api/openclaw/)
// ---------------------------------------------------------------------------

export async function sendMessage(
  message: string,
  sessionId: string = 'web:default',
  attachments?: FileAttachment[]
): Promise<{ response?: string; status?: string; session_id: string }> {
  const body: Record<string, unknown> = { message, session_id: sessionId };
  if (attachments && attachments.length > 0) {
    body.attachments = attachments;
  }
  return fetchJSON('/api/openclaw/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function streamMessage(
  message: string,
  sessionId: string,
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_URL}/api/openclaw/chat/stream`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onError(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content') {
              onChunk(parsed.content);
            } else if (parsed.type === 'done') {
              onDone();
            } else if (parsed.type === 'error') {
              onError(parsed.error);
            }
          } catch {
            // skip parse errors
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Stream error');
      }
    }
  })();

  return () => controller.abort();
}

// ---------------------------------------------------------------------------
// WebSocket Manager — speaks OpenClaw native protocol (Ed25519 handshake)
// ---------------------------------------------------------------------------

export type WsStatus = 'disconnected' | 'connecting' | 'connected';

export type WsEventHandler = (data: {
  type: string;
  event?: string;
  payload?: Record<string, unknown>;
}) => void;

export type WsStatusListener = (status: WsStatus) => void;

function getWsUrl(): string {
  const url = new URL(API_URL);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeDeviceMetadata(s: string): string {
  return s.trim().toLowerCase();
}

function randomUUID(): string {
  // crypto.randomUUID() requires a secure context (HTTPS/localhost).
  // Fall back to crypto.getRandomValues which works over plain HTTP.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // TypeError in non-secure context
    }
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private eventHandlers: WsEventHandler[] = [];
  private statusListeners: WsStatusListener[] = [];
  private status: WsStatus = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private intentionalClose = false;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  // Ed25519 device identity (ephemeral per page load)
  private privateKey = ed25519.utils.randomSecretKey();
  private publicKey = ed25519.getPublicKey(this.privateKey);
  private deviceId = hexEncode(sha256(this.publicKey));
  private publicKeyB64 = base64UrlEncode(this.publicKey);

  // Current session key for chat
  private _sessionKey: string | null = null;

  get sessionKey(): string | null {
    return this._sessionKey;
  }

  setSessionKey(key: string): void {
    this._sessionKey = key;
  }

  connect(): void {
    if (this.ws?.readyState === globalThis.WebSocket?.OPEN ||
        this.ws?.readyState === globalThis.WebSocket?.CONNECTING) {
      return;
    }
    this.intentionalClose = false;
    this.reconnectDelay = 1000;
    this._connect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this._cleanup();
    this._setStatus('disconnected');
  }

  sendMessage(content: string): void {
    if (!this._sessionKey) return;
    const idempotencyKey = randomUUID();
    this._send({
      type: 'req',
      id: randomUUID(),
      method: 'chat.send',
      params: {
        sessionKey: this._sessionKey,
        message: content,
        idempotencyKey,
      },
    });
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.status !== 'connected') {
      throw new Error('Not connected');
    }
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 60_000);
      this.pendingRequests.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      this._send({ type: 'req', id, method, params: params || {} });
    });
  }

  onEvent(handler: WsEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    };
  }

  onStatusChange(listener: WsStatusListener): () => void {
    this.statusListeners.push(listener);
    listener(this.status);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  getStatus(): WsStatus {
    return this.status;
  }

  private _send(obj: Record<string, unknown>): void {
    if (this.ws?.readyState === globalThis.WebSocket?.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private _connect(): void {
    this._cleanup();
    this._setStatus('connecting');

    const wsUrl = getWsUrl();
    const token = getAccessToken() || '';
    const ws = new globalThis.WebSocket(
      `${wsUrl}/api/openclaw/ws?token=${encodeURIComponent(token)}`
    );

    ws.onopen = () => {
      // Wait for connect.challenge event from gateway
    };

    ws.onmessage = (event) => {
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }

      if (frame.type === 'event') {
        const evt = frame as { type: string; event: string; payload: Record<string, unknown> };

        if (evt.event === 'connect.challenge') {
          this._handleChallenge(evt.payload);
          return;
        }

        if (evt.event === 'connect.ok' || evt.event === 'hello') {
          this.reconnectDelay = 1000;
          this._setStatus('connected');
          return;
        }

        // Forward other events to handlers
        for (const handler of this.eventHandlers) {
          handler(evt);
        }
      } else if (frame.type === 'res') {
        // Check if this is the connect response (before we're marked connected)
        if (this.status !== 'connected' && (frame as { ok?: boolean }).ok) {
          this.reconnectDelay = 1000;
          this._setStatus('connected');
        }

        const id = frame.id as string;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);
          if ((frame as { ok?: boolean }).ok) {
            pending.resolve((frame as { payload?: unknown }).payload);
          } else {
            const err = (frame as { error?: { message?: string } }).error;
            pending.reject(new Error(err?.message || 'Request failed'));
          }
        }
      }
    };

    ws.onclose = () => {
      if (!this.intentionalClose) {
        this._setStatus('disconnected');
        this._scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    this.ws = ws;
  }

  private _handleChallenge(payload: Record<string, unknown>): void {
    const nonce = String(payload.nonce || '').trim();
    const signedAtMs = Date.now();
    const clientId = 'webchat-ui';
    const clientMode = 'webchat';
    const role = 'operator';
    const scopes = ['operator.admin'];
    const platform = 'browser';

    // Build v3 auth payload
    const authPayload = [
      'v3',
      this.deviceId,
      clientId,
      clientMode,
      role,
      scopes.join(','),
      String(signedAtMs),
      '', // token (empty)
      nonce,
      normalizeDeviceMetadata(platform),
      normalizeDeviceMetadata(platform),
    ].join('|');

    const msgBytes = new TextEncoder().encode(authPayload);
    const signature = base64UrlEncode(ed25519.sign(msgBytes, this.privateKey));

    this._send({
      type: 'req',
      id: randomUUID(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: clientId,
          displayName: 'OpenClaw WebChat',
          version: '1.0.0',
          platform,
          mode: clientMode,
          deviceFamily: platform,
        },
        role,
        scopes,
        device: {
          id: this.deviceId,
          publicKey: this.publicKeyB64,
          signature,
          signedAt: signedAtMs,
          nonce,
        },
      },
    });
  }

  private _cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Reject pending requests
    this.pendingRequests.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error('Connection closed'));
    });
    this.pendingRequests.clear();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === globalThis.WebSocket?.OPEN ||
          this.ws.readyState === globalThis.WebSocket?.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  private _setStatus(status: WsStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

export const wsManager = new WebSocketManager();

// ---------------------------------------------------------------------------
// Sessions (proxied)
// ---------------------------------------------------------------------------

export async function listSessions(): Promise<Session[]> {
  return fetchJSON('/api/openclaw/sessions');
}

export async function getSession(key: string): Promise<SessionDetail> {
  return fetchJSON(`/api/openclaw/sessions/${encodeURIComponent(key)}`);
}

export async function deleteSession(key: string): Promise<void> {
  await fetchJSON(`/api/openclaw/sessions/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Status (proxied)
// ---------------------------------------------------------------------------

export async function getStatus(): Promise<SystemStatus> {
  return fetchJSON('/api/openclaw/status');
}

// ---------------------------------------------------------------------------
// Cron (proxied)
// ---------------------------------------------------------------------------

export async function listCronJobs(includeDisabled: boolean = true): Promise<CronJob[]> {
  return fetchJSON(`/api/openclaw/cron/jobs?include_disabled=${includeDisabled}`);
}

export async function addCronJob(params: {
  name: string;
  message: string;
  every_seconds?: number;
  cron_expr?: string;
  at_iso?: string;
}): Promise<CronJob> {
  return fetchJSON('/api/openclaw/cron/jobs', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function removeCronJob(jobId: string): Promise<void> {
  await fetchJSON(`/api/openclaw/cron/jobs/${jobId}`, { method: 'DELETE' });
}

export async function toggleCronJob(jobId: string, enabled: boolean): Promise<CronJob> {
  return fetchJSON(`/api/openclaw/cron/jobs/${jobId}/toggle`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

export async function runCronJob(jobId: string): Promise<void> {
  await fetchJSON(`/api/openclaw/cron/jobs/${jobId}/run`, { method: 'POST' });
}

export async function ping(): Promise<{ message: string }> {
  return fetchJSON('/api/ping');
}

// ---------------------------------------------------------------------------
// Skills (proxied)
// ---------------------------------------------------------------------------

export async function listSkills(): Promise<Skill[]> {
  return fetchJSON('/api/openclaw/skills');
}

export async function listCommands(): Promise<SlashCommand[]> {
  return fetchJSON('/api/openclaw/commands');
}

export async function listPlugins(): Promise<PluginInfo[]> {
  return fetchJSON('/api/openclaw/plugins');
}

export async function downloadSkill(name: string): Promise<void> {
  const url = `${API_URL}/api/openclaw/skills/${encodeURIComponent(name)}/download`;
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Download failed: ${text}`);
  }

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export async function deleteSkill(name: string): Promise<void> {
  await fetchJSON(`/api/openclaw/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function uploadSkill(file: File): Promise<Skill> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/api/openclaw/skills/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const retryHeaders: Record<string, string> = {};
      const newToken = getAccessToken();
      if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(`${API_URL}/api/openclaw/skills/upload`, {
        method: 'POST',
        headers: retryHeaders,
        body: formData,
      });
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`API error ${retry.status}: ${text}`);
      }
      return retry.json();
    }
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Marketplace (proxied)
// ---------------------------------------------------------------------------

export async function listMarketplaces(): Promise<Marketplace[]> {
  return fetchJSON('/api/openclaw/marketplaces');
}

export async function addMarketplace(source: string): Promise<Marketplace> {
  return fetchJSON('/api/openclaw/marketplaces', {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
}

export async function removeMarketplace(name: string): Promise<void> {
  await fetchJSON(`/api/openclaw/marketplaces/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function updateMarketplace(name: string): Promise<Marketplace> {
  return fetchJSON(`/api/openclaw/marketplaces/${encodeURIComponent(name)}/update`, {
    method: 'POST',
  });
}

export async function listMarketplacePlugins(name: string): Promise<MarketplacePlugin[]> {
  return fetchJSON(`/api/openclaw/marketplaces/${encodeURIComponent(name)}/plugins`);
}

export async function installMarketplacePlugin(marketplaceName: string, pluginName: string): Promise<void> {
  await fetchJSON(
    `/api/openclaw/marketplaces/${encodeURIComponent(marketplaceName)}/plugins/${encodeURIComponent(pluginName)}/install`,
    { method: 'POST' }
  );
}

export async function uninstallPlugin(pluginName: string): Promise<void> {
  await fetchJSON(`/api/openclaw/plugins/${encodeURIComponent(pluginName)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Files (proxied)
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function uploadFile(
  file: File,
  sessionId: string = 'web:default',
  onProgress?: (percent: number) => void
): Promise<FileAttachment> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large (max 50MB)');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('session_id', sessionId);

  const token = getAccessToken();

  const result = await new Promise<FileAttachment>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/openclaw/files/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve(data);
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(formData);
  });

  return result;
}

export async function listFiles(sessionId?: string): Promise<FileAttachment[]> {
  const params = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  return fetchJSON(`/api/openclaw/files${params}`);
}

export async function deleteFile(fileId: string): Promise<void> {
  await fetchJSON(`/api/openclaw/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}

export function getFileUrl(fileId: string): string {
  return `${API_URL}/api/openclaw/files/${encodeURIComponent(fileId)}`;
}

// ---------------------------------------------------------------------------
// Workspace Browser
// ---------------------------------------------------------------------------

export interface WorkspaceItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number | null;
  content_type?: string;
  modified: string;
}

export interface BrowseResult {
  path: string;
  items: WorkspaceItem[];
}

export async function browseWorkspace(path: string = ''): Promise<BrowseResult> {
  const params = path ? `?path=${encodeURIComponent(path)}` : '';
  return fetchJSON(`/api/openclaw/workspace/browse${params}`);
}

export function getWorkspaceDownloadUrl(path: string): string {
  return `${API_URL}/api/openclaw/workspace/download?path=${encodeURIComponent(path)}`;
}

export async function uploadToWorkspace(
  file: File,
  dirPath: string = '',
  onProgress?: (percent: number) => void
): Promise<WorkspaceItem> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large (max 50MB)');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', dirPath);

  const token = getAccessToken();

  return new Promise<WorkspaceItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/openclaw/workspace/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(formData);
  });
}

export async function deleteWorkspacePath(path: string): Promise<void> {
  await fetchJSON(`/api/openclaw/workspace/delete?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
}

export async function createWorkspaceDir(path: string): Promise<WorkspaceItem> {
  return fetchJSON(`/api/openclaw/workspace/mkdir?path=${encodeURIComponent(path)}`, {
    method: 'POST',
  });
}
