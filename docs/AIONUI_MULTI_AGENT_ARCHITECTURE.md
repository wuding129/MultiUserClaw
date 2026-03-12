# AionUi 多 Agent 核心架构研究报告

## 项目背景

**AionUi** (https://github.com/iOfficeAI/AionUi) 是一个免费开源的 Multi-Agent 桌面应用，支持 15+ 种 Agent 核心，包括：

内置 Agent (Gemini)、Claude Code、Codex、Qwen Code、Goose AI、OpenClaw、Augment Code、iFlow CLI、CodeBuddy、Kimi CLI、OpenCode、Factory Droid、GitHub Copilot、Qoder CLI、Mistral Vibe、Nanobot 等。

---

## 核心架构设计

### 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        AionUi (Electron)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Renderer   │  │    Main      │  │   Worker     │          │
│  │   Process    │  │   Process    │  │   Process    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘          │
│         │                 │                                      │
│         └────────┬────────┘                                      │
│                  │                                               │
│         ┌────────▼────────┐                                      │
│         │  Agent Manager  │                                      │
│         │  (AcpAgentMgr)  │                                      │
│         └────────┬────────┘                                      │
│                  │                                               │
│    ┌─────────────┼─────────────┬─────────────┐                  │
│    │             │             │             │                  │
│ ┌──▼───┐    ┌────▼────┐   ┌───▼───┐    ┌───▼────┐              │
│ │ ACP  │    │OpenClaw │   │Gemini │    │Nanobot │              │
│ │Agent │    │  Agent  │   │ Agent │    │ Agent  │              │
│ └──┬───┘    └────┬────┘   └───┬───┘    └───┬────┘              │
│    │             │             │             │                  │
│    │         ┌───▼───┐     ┌───▼───┐     ┌──▼──┐               │
│    │         │WebSocket│    │ Gemini │     │ CLI │               │
│    │         │Connection│   │  CLI   │     │Proc │               │
│    │         └────┬────┘   └───┬───┘     └──┬──┘               │
│    │              │             │             │                  │
│ ┌──▼──────────────▼─────────────▼─────────────▼──┐              │
│ │              External CLIs                    │              │
│ │  (claude, codex, qwen, goose, opencode...)   │              │
│ └────────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心抽象层

### 2.1 ACP (Agent Communication Protocol)

AionUi 使用 **ACP** 作为统一的 Agent 通信协议，这是从 Zed 编辑器发展而来的协议。

**协议特点：**
- 基于 **JSON-RPC 2.0**
- 支持 **stdio** 和 **WebSocket** 两种传输方式
- 统一的会话管理 (`session/new`, `session/update`)
- 标准化的工具调用格式

**核心类型定义** (`src/types/acpTypes.ts`):

```typescript
// ACP Backend 类型定义
export type AcpBackendAll =
  | 'claude'      // Claude ACP
  | 'gemini'      // Google Gemini ACP
  | 'qwen'        // Qwen Code ACP
  | 'iflow'       // iFlow CLI ACP
  | 'codex'       // OpenAI Codex ACP
  | 'codebuddy'   // Tencent CodeBuddy
  | 'droid'       // Factory Droid CLI
  | 'goose'       // Block's Goose CLI
  | 'auggie'      // Augment Code CLI
  | 'kimi'        // Kimi CLI (Moonshot)
  | 'opencode'    // OpenCode CLI
  | 'copilot'     // GitHub Copilot CLI
  | 'qoder'       // Qoder CLI
  | 'openclaw-gateway' // OpenClaw Gateway WebSocket
  | 'nanobot'     // nanobot CLI
  | 'custom';     // User-configured custom ACP agent
```

### 2.2 Agent 配置注册表

**集中式配置** (`src/types/acpTypes.ts:ACP_BACKENDS_ALL`):

```typescript
export const ACP_BACKENDS_ALL: Record<AcpBackendAll, AcpBackendConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    cliCommand: 'claude',
    authRequired: true,
    enabled: true,
    supportsStreaming: false,
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    cliCommand: 'codex',
    defaultCliPath: `npx ${CODEX_ACP_NPX_PACKAGE}`,
    authRequired: true,
    enabled: true,
    supportsStreaming: false,
    acpArgs: [], // codex-acp is ACP by default
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    cliCommand: 'qwen',
    defaultCliPath: 'npx @qwen-code/qwen-code',
    authRequired: true,
    enabled: true,
    supportsStreaming: true,
    acpArgs: ['--acp'],
  },
  // ... 其他 Agent
};
```

**关键配置项：**
- `cliCommand`: 用于 `which` 命令检测的可执行文件名
- `defaultCliPath`: 启动进程的完整路径（可包含参数）
- `acpArgs`: 启用 ACP 模式的参数（如 `--acp`, `--experimental-acp`）
- `authRequired`: 是否需要认证
- `supportsStreaming`: 是否支持流式响应

---

## 3. Agent 自动检测机制

### 3.1 检测流程

**AcpDetector** (`src/agent/acp/AcpDetector.ts`):

```typescript
class AcpDetector {
  async initialize(): Promise<void> {
    const detected: DetectedAgent[] = [];

    // 1. 并行检测所有潜在的 ACP CLI
    const detectionPromises = POTENTIAL_ACP_CLIS.map((cli) => {
      return Promise.resolve().then(() => {
        if (!isCliAvailable(cli.cmd)) return null;
        return {
          backend: cli.backendId,
          name: cli.name,
          cliPath: cli.cmd,
          acpArgs: cli.args,
        };
      });
    });

    // 2. 始终添加内置 Gemini 作为默认选项
    detected.unshift({
      backend: 'gemini',
      name: 'Gemini CLI',
      cliPath: undefined,
      acpArgs: undefined,
    });

    // 3. 添加扩展贡献的 Agent
    this.addExtensionAgentsToList(detected);

    // 4. 添加用户自定义 Agent
    await this.addCustomAgentsToList(detected);
  }
}
```

### 3.2 CLI 可用性检测

```typescript
const isCliAvailable = (cliCommand: string): boolean => {
  try {
    execSync(`${whichCommand} ${cliCommand}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 1000,
      env: enhancedEnv,
    });
    return true;
  } catch {
    // Windows PowerShell fallback for shim scripts
    if (isWindows) {
      try {
        execSync(`powershell -NoProfile -Command "Get-Command ${cliCommand}"`, ...);
        return true;
      } catch { return false; }
    }
    return false;
  }
};
```

---

## 4. Agent 适配器架构

### 4.1 统一接口设计

**AcpAgent** - ACP 协议的统一封装 (`src/agent/acp/index.ts`):

```typescript
export interface AcpAgentConfig {
  id: string;
  backend: AcpBackend;
  cliPath?: string;
  workingDir: string;
  customArgs?: string[];
  customEnv?: Record<string, string>;
  onStreamEvent: (data: IResponseMessage) => void;
  onSignalEvent?: (data: IResponseMessage) => void;
}

export class AcpAgent {
  private connection: AcpConnection;
  private adapter: AcpAdapter;

  constructor(config: AcpAgentConfig) {
    this.connection = new AcpConnection();
    this.adapter = new AcpAdapter(this.id, this.extra.backend);
    this.setupConnectionHandlers();
  }

  async start(): Promise<void> {
    await this.connection.connect(...);
    await this.performAuthentication();
    await this.createOrResumeSession();
  }

  async sendMessage(content: string): Promise<AcpResult> {
    // 统一的消息发送接口
  }
}
```

### 4.2 消息适配器 (AcpAdapter)

**AcpAdapter** (`src/agent/acp/AcpAdapter.ts`) - 将 ACP 消息转换为 AionUI 内部格式：

```typescript
export class AcpAdapter {
  convertSessionUpdate(sessionUpdate: AcpSessionUpdate): TMessage[] {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        return this.convertSessionUpdateChunk(update);
      case 'tool_call':
        return this.createOrUpdateAcpToolCall(update);
      case 'plan':
        return this.convertPlanUpdate(update);
      // ...
    }
  }
}
```

### 4.3 连接管理层

**AcpConnection** (`src/agent/acp/AcpConnection.ts`) - 管理子进程生命周期：

```typescript
export class AcpConnection {
  private child: ChildProcess | null = null;
  private sessionId: string | null = null;

  async connect(
    backend: AcpBackend,
    cliPath: string,
    workingDir: string,
    customArgs?: string[],
    customEnv?: Record<string, string>
  ): Promise<void> {
    // 1. 创建 spawn 配置
    const spawnConfig = createGenericSpawnConfig(cliPath, workingDir, acpArgs, env);

    // 2. 启动子进程
    this.child = spawn(command, args, options);

    // 3. 设置消息处理器
    this.setupStdioHandlers();

    // 4. 发送 initialize 请求
    const initResult = await this.sendRequest('initialize', params);
  }
}
```

---

## 5. 特殊 Agent 实现

### 5.1 OpenClaw Agent (WebSocket 模式)

**架构差异：**
- 不使用 stdio，而是通过 **WebSocket** 连接到 OpenClaw Gateway
- Gateway 是常驻进程，支持多会话

**实现** (`src/agent/openclaw/index.ts`):

```typescript
export class OpenClawAgent {
  private gatewayManager: OpenClawGatewayManager | null = null;
  private connection: OpenClawGatewayConnection | null = null;
  private adapter: AcpAdapter; // 复用 ACP 适配器

  async start(): Promise<void> {
    // 1. 启动 Gateway（如果未运行）
    if (!useExternal) {
      this.gatewayManager = new OpenClawGatewayManager({ port });
      await this.gatewayManager.start();
    }

    // 2. 建立 WebSocket 连接
    this.connection = new OpenClawGatewayConnection({
      url: `ws://${host}:${port}`,
      onEvent: (evt) => this.handleEvent(evt),
    });

    // 3. 复用 AcpAdapter 处理消息
    this.adapter = new AcpAdapter(this.id, 'openclaw-gateway');
  }
}
```

### 5.2 Nanobot Agent (CLI 模式)

**架构特点：**
- 无状态设计，每次消息调用独立进程
- 使用 `nanobot agent -m "<msg>" --session <id>`

**实现** (`src/agent/nanobot/index.ts`):

```typescript
export class NanobotAgent {
  private connection: NanobotConnection;

  async sendMessage(data: { content: string }): Promise<AcpResult> {
    // 每次调用都是新的进程
    const responseText = await this.connection.sendMessage(
      data.content,
      this.sessionId
    );

    // 将响应转换为标准事件格式
    this.config.onStreamEvent({
      type: 'content',
      conversation_id: this.id,
      data: responseText,
    });

    this.config.onSignalEvent({
      type: 'finish',
      conversation_id: this.id,
      data: null,
    });
  }
}
```

### 5.3 Gemini Agent (内置 Agent)

- 直接集成 Gemini CLI 工具
- 支持完整的工具调用（图像生成、Web 搜索等）
- 自己的工具调度系统 (`useReactToolScheduler`)

---

## 6. MCP 工具共享机制

### 6.1 架构设计

AionUi 的核心优势之一是**配置一次 MCP，自动同步到所有 Agent**。

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Service Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │  Claude     │    │    Qwen     │    │   Gemini    │          │
│  │  MCP Agent  │    │  MCP Agent  │    │  MCP Agent  │          │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘          │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            │                                     │
│                    ┌───────▼────────┐                           │
│                    │   McpService   │                           │
│                    │   (统一协调)    │                           │
│                    └───────┬────────┘                           │
│                            │                                     │
│              ┌─────────────┼─────────────┐                      │
│              ▼             ▼             ▼                      │
│         ┌────────┐   ┌────────┐   ┌────────┐                   │
│         │MCP SSE │   │MCP STD │   │MCP WS  │                   │
│         │Server 1│   │Server 2│   │Server 3│                   │
│         └────────┘   └────────┘   └────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 MCP 服务实现

**McpService** (`src/process/services/mcpServices/McpService.ts`):

```typescript
export class McpService {
  private agents: Map<McpSource, IMcpProtocol>;

  constructor() {
    this.agents = new Map([
      ['claude', new ClaudeMcpAgent()],
      ['codebuddy', new CodebuddyMcpAgent()],
      ['qwen', new QwenMcpAgent()],
      ['iflow', new IflowMcpAgent()],
      ['gemini', new GeminiMcpAgent()],
      ['aionui', new AionuiMcpAgent()],  // 内置 Gemini
      ['codex', new CodexMcpAgent()],
    ]);
  }

  /**
   * 将 MCP 配置同步到所有检测到的 Agent
   */
  async syncMcpToAgents(
    mcpServers: IMcpServer[],
    agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>
  ): Promise<McpSyncResult> {
    const enabledServers = mcpServers.filter(s => s.enabled);

    return this.withServiceLock(async () => {
      // 并发执行所有 Agent 的 MCP 同步
      const promises = agents.map(async (agent) => {
        const agentInstance = this.getAgentForConfig(agent);

        // 检查该 Agent 是否支持此传输类型
        const supportedTransports = agentInstance.getSupportedTransports();
        const compatibleServers = enabledServers.filter(
          s => supportedTransports.includes(s.transport.type)
        );

        if (compatibleServers.length === 0) {
          return { agent: agent.name, success: true, skipped: true };
        }

        // 安装/更新 MCP 配置到该 Agent
        return await agentInstance.installMcpServers(
          compatibleServers,
          agent.cliPath
        );
      });

      const results = await Promise.all(promises);
      return { success: true, results };
    });
  }
}
```

### 6.3 Agent 特定的 MCP 实现

每个 Agent 有自己的 MCP 安装逻辑（因为配置存储位置不同）：

**ClaudeMcpAgent** - 修改 Claude CLI 配置文件：

```typescript
class ClaudeMcpAgent implements IMcpProtocol {
  async installMcpServers(servers: IMcpServer[], cliPath?: string): Promise<McpOperationResult> {
    // 1. 读取 Claude CLI 配置文件 ~/.claude/settings.json
    const config = await this.readClaudeConfig(cliPath);

    // 2. 转换 MCP 服务器配置为 Claude 格式
    config.mcpServers = servers.reduce((acc, server) => {
      acc[server.name] = this.convertToClaudeFormat(server);
      return acc;
    }, {});

    // 3. 写回配置文件
    await this.writeClaudeConfig(cliPath, config);

    return { agent: 'claude', success: true };
  }

  getSupportedTransports(): string[] {
    return ['stdio', 'sse'];  // Claude 支持 stdio 和 sse
  }
}
```

**GeminiMcpAgent** - 修改 Gemini CLI 配置：

```typescript
class GeminiMcpAgent implements IMcpProtocol {
    async installMcpServers(servers: IMcpServer[]): Promise<McpOperationResult> {
    // Gemini CLI 使用不同的配置格式
    const geminiConfig = {
      mcp: {
        servers: servers.map(s => ({
          name: s.name,
          command: s.transport.type === 'stdio' ? s.transport.command : undefined,
          url: s.transport.type === 'sse' ? s.transport.url : undefined,
        }))
      }
    };

    // 写入 ~/.gemini/config.json
    await this.writeGeminiConfig(geminiConfig);
    return { agent: 'gemini', success: true };
  }
}
```

### 6.4 前端 MCP 管理 UI

**MCP 状态管理 Hook** (`src/renderer/hooks/mcp/useMcpAgentStatus.ts`):

```typescript
export const useMcpAgentStatus = () => {
  const [agentInstallStatus, setAgentInstallStatus] = useState<Record<string, string[]>>();

  // 检查每个 MCP 服务器在哪些 Agent 中安装了
  const checkAgentInstallStatus = useCallback(async (servers: IMcpServer[]) => {
    // 1. 获取所有可用 Agents
    const agentsResponse = await acpConversation.getAvailableAgents.invoke();

    // 2. 获取所有 Agents 的 MCP 配置
    const mcpConfigsResponse = await mcpService.getAgentMcpConfigs.invoke(agentsResponse.data);

    // 3. 检查每个服务器在哪些 Agent 中配置
    const installStatus: Record<string, string[]> = {};
    for (const server of servers) {
      installStatus[server.name] = [];
      for (const agentConfig of mcpConfigsResponse.data) {
        const hasServer = agentConfig.servers.some(s => s.name === server.name);
        if (hasServer) {
          installStatus[server.name].push(agentConfig.source);
        }
      }
    }

    setAgentInstallStatus(installStatus);
  }, []);

  return {
    agentInstallStatus,
    checkAgentInstallStatus,
  };
};
```

### 6.5 MCP 同步操作流程

```
用户添加 MCP Server
    │
    ▼
┌──────────────────┐
│  测试连接         │
│ (testMcpConnection)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  保存配置         │
│ (ConfigStorage)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  获取可用 Agents  │
│ (getAvailableAgents)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  并行同步到所有    │
│  兼容的 Agents    │
│ (syncMcpToAgents) │
└────────┬─────────┘
         │
         ▼
    显示结果
(成功/部分失败/失败)
```

### 6.6 关键设计优势

1. **统一配置**: 用户在 UI 配置一次 MCP，自动应用到所有 Agent
2. **传输类型兼容**: 自动检测 Agent 支持的传输类型（stdio/sse/websocket）
3. **并发同步**: 并行向所有 Agent 同步配置，提高效率
4. **状态追踪**: 实时显示每个 MCP 服务器在哪些 Agent 中可用
5. **服务锁**: 防止并发 MCP 操作导致资源耗尽

---

## 7. 会话管理与恢复机制

### 7.1 会话恢复架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Session Resume Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐             │
│  │ Storage  │──────▶│  Agent   │──────▶│ Backend  │             │
│  │ (Disk)   │      │ (Memory) │      │ (CLI)    │             │
│  └──────────┘      └──────────┘      └──────────┘             │
│       │                 │                 │                     │
│       │ resumeSessionId │                 │                     │
│       ▼                 │                 │                     │
│  ┌──────────┐           │                 │                     │
│  │ Conversation│        │  session/new    │                     │
│  │  Model   │──────────▶│  (with resume)  │                     │
│  └──────────┘           │                 │                     │
│                         └────────────────▶│                     │
│                                           │                     │
│                              ┌────────────┘                     │
│                              ▼                                  │
│                    ┌──────────────────┐                        │
│                    │  Restore History │                        │
│                    │  from Disk       │                        │
│                    └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 会话恢复实现

**OpenClaw 会话恢复** (`src/agent/openclaw/index.ts`):

```typescript
export class OpenClawAgent {
  private async resolveSession(): Promise<void> {
    const resumeKey = this.config.extra?.sessionKey;

    // 1. 如果有恢复 key，尝试恢复现有会话
    if (resumeKey) {
      try {
        const result = await this.connection.sessionsResolve({ key: resumeKey });
        this.connection.sessionKey = result.key;
        console.log('[OpenClawAgent] Resumed session:', result.key);
        return;
      } catch (err) {
        console.warn('[OpenClawAgent] Failed to resume session:', err);
        // 恢复失败则创建新会话
      }
    }

    // 2. 创建新会话
    const defaultKey = await this.connection.sessionsNew();
    this.connection.sessionKey = defaultKey;

    // 3. 通知上层更新 sessionKey
    if (defaultKey !== resumeKey && this.onSessionKeyUpdate) {
      this.onSessionKeyUpdate(defaultKey);
    }
  }
}
```

**ACP 会话恢复** (`src/agent/acp/AcpConnection.ts`):

```typescript
export class AcpConnection {
  /**
   * 创建新会话或恢复现有会话
   */
  async newSession(
    cwd: string = process.cwd(),
    options?: { resumeSessionId?: string; forkSession?: boolean }
  ): Promise<AcpResponse & { sessionId?: string }> {
    // Claude/CodeBuddy 使用 _meta 进行会话恢复
    const useMetaResume = (this.backend === 'claude' || this.backend === 'codebuddy')
      && options?.resumeSessionId;

    const params = {
      cwd,
      ...(useMetaResume && {
        _meta: {
          claudeCode: {
            options: {
              resume: options.resumeSessionId,  // 恢复指定会话
            },
          },
        },
      }),
      // 其他后端使用通用 resumeSessionId 参数
      ...(this.backend !== 'claude' && this.backend !== 'codebuddy'
        && options?.resumeSessionId && { resumeSessionId: options.resumeSessionId }),
    };

    const response = await this.sendRequest('session/new', params);
    this.sessionId = response.result?.sessionId;
    return response;
  }

  /**
   * 加载/恢复现有会话（使用 session/load 方法）
   */
  async loadSession(sessionId: string): Promise<AcpResponse> {
    const params = {
      sessionId,
    };

    const response = await this.sendRequest('session/load', params);
    this.sessionId = sessionId;
    return response;
  }
}
```

### 7.3 会话 ID 管理

**会话配置接口** (`src/agent/acp/index.ts`):

```typescript
export interface AcpAgentConfig {
  // ... 其他配置

  /** ACP session ID for resume support / ACP 会话 ID 用于会话恢复 */
  acpSessionId?: string;

  /** Callback when ACP session ID is updated / 当 ACP session ID 更新时的回调 */
  onSessionIdUpdate?: (sessionId: string) => void;
}

export class AcpAgent {
  private extra: {
    // ...
    /** ACP session ID for resume support */
    acpSessionId?: string;
  };

  /**
   * 获取当前 ACP 会话 ID
   */
  getAcpSessionId(): string | null {
    return this.connection.getSessionId();
  }

  /**
   * 创建新会话或恢复现有会话
   */
  private async createOrResumeSession(): Promise<void> {
    const resumeSessionId = this.extra.acpSessionId;

    // 尝试恢复现有会话
    if (resumeSessionId) {
      try {
        await this.connection.newSession(this.extra.workspace, { resumeSessionId });
        console.log(`[ACP] Resumed session: ${resumeSessionId}`);
        return;
      } catch (error) {
        console.warn(`[ACP] Failed to resume session ${resumeSessionId}:`, error);
        // 恢复失败则创建新会话
      }
    }

    // 创建新会话
    await this.connection.newSession(this.extra.workspace);

    // 通知上层 session ID 变化
    const newSessionId = this.connection.getSessionId();
    if (newSessionId && this.onSessionIdUpdate) {
      this.onSessionIdUpdate(newSessionId);
    }
  }
}
```

### 7.4 会话持久化存储

```typescript
// 会话数据模型
interface Conversation {
  id: string;
  type: 'gemini' | 'claude' | 'codex' | ...;

  // OpenClaw 会话恢复
  sessionKey?: string;

  // ACP 会话恢复
  acpSessionId?: string;

  // 最后更新时间
  acpSessionUpdatedAt?: number;

  // 消息历史
  messages: TMessage[];
}

// 保存会话时
async function saveConversation(conv: Conversation) {
  // 从 Agent 获取最新的 session ID
  if (agent.getAcpSessionId) {
    conv.acpSessionId = agent.getAcpSessionId();
    conv.acpSessionUpdatedAt = Date.now();
  }

  await ConfigStorage.set(`conversation.${conv.id}`, conv);
}
```

---

## 8. 前端聊天界面 UI 设计

### 8.1 整体布局架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AionUi Chat Layout                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌─────────────────────────────────────┐  ┌────────────────┐ │
│  │          │  │                                     │  │                │ │
│  │  Left    │  │           Chat Area                 │  │   Workspace    │ │
│  │  Sidebar │  │         (Resizable)                 │  │    Panel       │ │
│  │          │  │                                     │  │  (Collapsible) │ │
│  │ - Agents │  │  ┌─────────────────────────────┐   │  │                │ │
│  │ - History│  │  │    ConversationTabs         │   │  │ - File Tree   │ │
│  │          │  │  │    (Multi-session)          │   │  │ - Preview     │ │
│  │          │  │  └─────────────────────────────┘   │  │ - Settings    │ │
│  │          │  │                                     │  │                │ │
│  │          │  │  ┌─────────────────────────────┐   │  │                │ │
│  │          │  │  │      MessageList            │   │  │                │ │
│  │          │  │  │    (Virtual Scrolling)      │   │  │                │ │
│  │          │  │  │                             │   │  │                │ │
│  │          │  │  │  ┌─────────────────────┐   │   │  │                │ │
│  │          │  │  │  │   Tool Call Card    │   │   │  │                │ │
│  │          │  │  │  └─────────────────────┘   │   │  │                │ │
│  │          │  │  │  ┌─────────────────────┐   │   │  │                │ │
│  │          │  │  │  │   Permission UI     │   │   │  │                │ │
│  │          │  │  │  └─────────────────────┘   │   │  │                │ │
│  │          │  │  │                             │   │  │                │ │
│  │          │  │  └─────────────────────────────┘   │  │                │ │
│  │          │  │                                     │  │                │ │
│  │          │  │  ┌─────────────────────────────┐   │  │                │ │
│  │          │  │  │        SendBox              │   │  │                │ │
│  │          │  │  │   - Text Input              │   │  │                │ │
│  │          │  │  │   - File Upload             │   │  │                │ │
│  │          │  │  │   - Mode Selector           │   │  │                │ │
│  │          │  │  └─────────────────────────────┘   │  │                │ │
│  └──────────┘  └─────────────────────────────────────┘  └────────────────┘ │
│         ▲              ▲ (Resizable)                     ▲ (Collapsible)  │
│         │              │                                  │                │
│     200px min      360px min                          220px min           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 消息列表组件设计

**MessageList** (`src/renderer/messages/MessageList.tsx`):

```typescript
const MessageList: React.FC = () => {
  const list = useMessageList();
  const { virtuosoRef, handleScroll, showScrollButton, scrollToBottom } = useAutoScroll({
    messages: list,
  });

  // 预处理消息列表，合并相关消息
  const processedList = useMemo(() => {
    const result: IMessageVO[] = [];

    for (const message of list) {
      // 跳过 available_commands 消息（太嘈杂）
      if (message.type === 'available_commands') continue;

      // 合并 Codex 的 turn_diff 消息为文件摘要
      if (message.type === 'codex_tool_call' && message.content.subtype === 'turn_diff') {
        pushFileDiffChanges(parseDiff(message.content.data.unified_diff));
        continue;
      }

      // 合并 tool_group 消息
      if (message.type === 'tool_group') {
        pushToolList(message);
        continue;
      }

      result.push(message);
    }
    return result;
  }, [list]);

  return (
    <div className='relative flex-1 h-full'>
      <Image.PreviewGroup>
        <Virtuoso
          ref={virtuosoRef}
          data={processedList}
          initialTopMostItemIndex={processedList.length - 1}
          atBottomThreshold={100}
          increaseViewportBy={200}
          itemContent={renderItem}
          followOutput={handleFollowOutput}
          onScroll={handleScroll}
        />
      </Image.PreviewGroup>

      {/* 滚动到底部按钮 */}
      {showScrollButton && (
        <div className='absolute bottom-20px left-50% transform -translate-x-50%'>
          <ScrollToBottomButton onClick={handleScrollButtonClick} />
        </div>
      )}
    </div>
  );
};
```

### 8.3 消息类型与渲染

**消息类型定义** (`src/common/chatLib.ts`):

```typescript
export type TMessage =
  | IMessageText           // 文本消息
  | IMessageTips           // 提示/警告消息
  | IMessageToolCall       // 工具调用
  | IMessageToolGroup      // 工具组（合并显示）
  | IMessageAcpToolCall    // ACP 工具调用
  | IMessagePlan           // 计划消息
  | IMessageAgentStatus    // Agent 状态
  | IMessageAcpPermission  // ACP 权限请求
  | IMessageCodexToolCall  // Codex 工具调用
  | IMessageAvailableCommands; // 可用命令更新

// 消息位置
export type TMessagePosition = 'left' | 'right' | 'center';
// left: AI 消息
// right: 用户消息
// center: 系统提示
```

**消息渲染组件** (`src/renderer/messages/MessageItem.tsx`):

```typescript
const MessageItem: React.FC<{ message: TMessage }> = React.memo(({ message }) => {
  switch (message.type) {
    case 'text':
      return <MessageText message={message} />;
    case 'acp_tool_call':
      return <MessageAcpToolCall message={message} />;
    case 'acp_permission':
      return <MessageAcpPermission message={message} />;
    case 'plan':
      return <MessagePlan message={message} />;
    case 'agent_status':
      return <MessageAgentStatus message={message} />;
    // ... 其他类型
  }
});
```

### 8.4 ACP 工具调用卡片

**MessageAcpToolCall** (`src/renderer/messages/acp/MessageAcpToolCall.tsx`):

```typescript
const MessageAcpToolCall: React.FC<{ message: IMessageAcpToolCall }> = ({ message }) => {
  const { update } = message.content;
  const { toolCallId, kind, title, status, rawInput, content } = update;

  const getKindDisplayName = (kind: string) => {
    switch (kind) {
      case 'edit': return 'File Edit';
      case 'read': return 'File Read';
      case 'execute': return 'Shell Command';
      default: return kind;
    }
  };

  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          {/* 标题和状态 */}
          <div className='flex items-center gap-2 mb-2'>
            <span className='font-medium text-t-primary'>
              {title || getKindDisplayName(kind)}
            </span>
            <StatusTag status={status} />
          </div>

          {/* 原始输入参数 */}
          {rawInput && (
            <div className='text-sm'>
              <pre className='bg-1 p-2 rounded text-xs overflow-x-auto'>
                {JSON.stringify(rawInput, null, 2)}
              </pre>
            </div>
          )}

          {/* 差异内容（如果是文件编辑） */}
          {content?.map((item, index) => (
            item.type === 'diff' && (
              <FileChangesPanel
                key={index}
                title={item.path}
                oldText={item.oldText}
                newText={item.newText}
                defaultExpanded={true}
              />
            )
          ))}

          <div className='text-xs text-t-secondary mt-2'>
            Tool Call ID: {toolCallId}
          </div>
        </div>
      </div>
    </Card>
  );
};
```

### 8.5 权限请求 UI

**MessageAcpPermission** (`src/renderer/messages/acp/MessageAcpPermission.tsx`):

```typescript
const MessageAcpPermission: React.FC<{ message: IMessageAcpPermission }> = ({ message }) => {
  const { toolCall, options } = message.content;

  const handlePermissionResponse = async (optionId: string) => {
    await acpConversation.sendPermissionResponse.invoke({
      requestId: message.id,
      optionId,
    });
  };

  return (
    <div className='permission-request-card'>
      <Card className='w-full mb-2 border-warning'>
        <div className='flex items-center gap-2 mb-3'>
          <IconLock />
          <span className='font-medium'>Permission Request</span>
        </div>

        {/* 工具调用详情 */}
        <div className='bg-1 p-3 rounded mb-3'>
          <div className='font-medium'>{toolCall.title}</div>
          {toolCall.rawInput?.command && (
            <code className='block mt-1 text-sm'>{toolCall.rawInput.command}</code>
          )}
        </div>

        {/* 权限选项按钮 */}
        <div className='flex gap-2'>
          {options.map((option) => (
            <Button
              key={option.optionId}
              type={option.kind.includes('always') ? 'primary' : 'default'}
              onClick={() => handlePermissionResponse(option.optionId)}
            >
              {option.name}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
};
```

### 8.6 计划消息 UI

**MessagePlan** (`src/renderer/messages/MessagePlan.tsx`):

```typescript
const MessagePlan: React.FC<{ message: IMessagePlan }> = ({ message }) => {
  const { entries } = message.content;

  return (
    <div className='plan-message my-4'>
      <div className='text-sm text-t-secondary mb-2'>Plan:</div>
      <div className='plan-entries space-y-2'>
        {entries.map((entry, index) => (
          <div
            key={index}
            className={classNames('plan-entry flex items-center gap-2', {
              'opacity-50': entry.status === 'completed',
              'font-medium': entry.status === 'in_progress',
            })}
          >
            <StatusIcon status={entry.status} />
            <span>{entry.content}</span>
            {entry.priority && <PriorityTag priority={entry.priority} />}
          </div>
        ))}
      </div>
    </div>
  );
};
```

### 8.7 聊天输入框设计

**SendBox** (`src/renderer/components/sendbox.tsx`):

```typescript
const SendBox: React.FC = () => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const { currentAgent } = useConversationContext();

  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return;

    // 构建消息
    const message = {
      content: input,
      files: files.length > 0 ? files : undefined,
    };

    // 发送到当前 Agent
    await sendMessageToAgent(currentAgent.id, message);

    setInput('');
    setFiles([]);
  };

  return (
    <div className='sendbox-container'>
      {/* 文件上传预览 */}
      {files.length > 0 && (
        <FilePreviewList files={files} onRemove={removeFile} />
      )}

      <div className='sendbox-input-row'>
        {/* 模式选择器（仅 ACP Agent） */}
        {currentAgent?.backend && (
          <AgentModeSelector
            backend={currentAgent.backend}
            value={currentMode}
            onChange={setMode}
          />
        )}

        {/* 文本输入 */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder='Type a message...'
          className='sendbox-textarea'
        />

        {/* 文件上传按钮 */}
        <FileUploadButton onSelect={addFiles} />

        {/* 发送按钮 */}
        <SendButton onClick={handleSend} disabled={!input.trim() && files.length === 0} />
      </div>
    </div>
  );
};
```

### 8.8 多会话标签页

**ConversationTabs** (`src/renderer/pages/conversation/ConversationTabs.tsx`):

```typescript
const ConversationTabs: React.FC = () => {
  const { openTabs, activeTab, switchTab, closeTab } = useConversationTabs();

  return (
    <div className='conversation-tabs flex items-center gap-1 px-2 border-b'>
      {openTabs.map((tab) => (
        <Tab
          key={tab.id}
          active={activeTab === tab.id}
          onClick={() => switchTab(tab.id)}
          onClose={() => closeTab(tab.id)}
          icon={getAgentIcon(tab.backend)}
        >
          <span className='truncate max-w-120px'>{tab.title}</span>
          {tab.hasUnRead && <UnreadIndicator />}
        </Tab>
      ))}

      <NewTabButton onClick={createNewConversation} />
    </div>
  );
};
```

### 8.9 UI 设计亮点

1. **虚拟滚动**: 使用 `react-virtuoso` 处理大量消息，保持流畅性能
2. **消息合并**: 自动合并相关的工具调用和文件变更，减少视觉噪音
3. **智能滚动**: 自动滚动到底部，但用户滚动查看历史时保持位置
4. **权限拦截**: 工具调用权限请求内嵌在消息流中，不打断对话
5. **代码差异**: 文件编辑直接显示 diff，支持展开/折叠
6. **图片预览**: 使用 `Image.PreviewGroup` 支持跨消息图片浏览
7. **响应式**: 移动端适配，侧边栏可折叠

---

## 10. 扩展系统架构

### 10.1 扩展贡献的 ACP 适配器

**扩展配置** (`contributes/acp-adapters.json`):

```json
[
  {
    "id": "hello-stdio-agent",
    "name": "Hello Stdio Agent",
    "connectionType": "stdio",
    "cliCommand": "echo",
    "acpArgs": ["--acp"],
    "supportsStreaming": true,
    "apiKeyFields": [
      {
        "key": "HELLO_API_KEY",
        "label": "API Key",
        "type": "password",
        "required": true
      }
    ]
  },
  {
    "id": "hello-http-agent",
    "name": "Hello HTTP Agent",
    "connectionType": "http",
    "endpoint": "http://localhost:8080/acp",
    "supportsStreaming": false
  }
]
```

**支持的连接类型：**
- `cli` / `stdio`: 通过子进程 stdio 通信
- `websocket`: 通过 WebSocket 连接
- `http`: 通过 HTTP API 连接

### 10.2 扩展解析流程

```typescript
// AcpAdapterResolver.ts
export function resolveAcpAdapters(extensions: LoadedExtension[]): Record<string, unknown>[] {
  for (const ext of extensions) {
    const declaredAdapters = ext.manifest.contributes.acpAdapters;
    for (const adapter of declaredAdapters) {
      adapters.push(convertAcpAdapter(adapter, ext));
    }
  }
}
```

---

## 11. 模式切换机制

### 11.1 Agent 模式定义

**模式配置** (`src/renderer/constants/agentModes.ts`):

```typescript
export const AGENT_MODES: Record<string, AgentModeOption[]> = {
  claude: [
    { value: 'default', label: 'Default' },
    { value: 'plan', label: 'Plan' },
    { value: 'bypassPermissions', label: 'YOLO' },
  ],
  qwen: [
    { value: 'default', label: 'Default' },
    { value: 'yolo', label: 'YOLO' },
  ],
  codex: [
    { value: 'default', label: 'Plan' },
    { value: 'autoEdit', label: 'Auto Edit' },
    { value: 'yolo', label: 'Full Auto' },
  ],
  // ...
};
```

### 11.2 YOLO 模式实现

```typescript
// 在 AcpAgent.start() 中
if (this.extra.yoloMode) {
  const yoloModeMap: Partial<Record<AcpBackend, string>> = {
    claude: CLAUDE_YOLO_SESSION_MODE,      // 'yoYoMode'
    codebuddy: CODEBUDDY_YOLO_SESSION_MODE, // 'yolo'
    qwen: QWEN_YOLO_SESSION_MODE,          // 'yolo'
    iflow: IFLOW_YOLO_SESSION_MODE,        // 'yolo'
  };
  const sessionMode = yoloModeMap[this.extra.backend];
  if (sessionMode) {
    await this.connection.setSessionMode(sessionMode);
  }
}
```

---

## 12. 对 MultiUserClaw 的启示

### 12.1 架构对比

| 维度 | AionUi | MultiUserClaw (当前) |
|------|--------|---------------------|
| 架构模式 | 单体 Electron 应用 | 多租户容器化平台 |
| Agent 运行 | 本地子进程 | 用户隔离容器 |
| 协议 | ACP (JSON-RPC) | OpenClaw WebSocket |
| Agent 检测 | 本地 CLI 检测 | 容器镜像选择 |
| 扩展性 | 扩展系统 | 技能系统 |

### 12.2 可借鉴的设计

#### 1) 统一的 Agent 配置注册表

```typescript
// 建议：在 MultiUserClaw 中创建类似的 Agent 引擎配置
const AGENT_ENGINES: Record<string, AgentEngineConfig> = {
  openclaw: {
    id: 'openclaw',
    name: 'OpenClaw',
    image: 'multiuserclaw/openclaw:latest',
    port: 18789,
    protocol: 'websocket',
  },
  nanobot: {
    id: 'nanobot',
    name: 'Nanobot',
    image: 'multiuserclaw/nanobot-ts:latest',
    port: 18080,
    protocol: 'http',
  },
};
```

#### 2) 部署时选择方案（推荐）

基于 AionUi 的经验，**部署时选择** 比 **创建时选择** 更简单可靠：

```yaml
# docker-compose.yml
services:
  user-container:
    image: ${AGENT_ENGINE_IMAGE:-multiuserclaw/openclaw:latest}
    environment:
      - AGENT_ENGINE_TYPE=${AGENT_ENGINE_TYPE:-openclaw}
```

```typescript
// Bridge 层根据环境变量加载对应适配器
const engineType = process.env.AGENT_ENGINE_TYPE || 'openclaw';

if (engineType === 'openclaw') {
  return new OpenClawAdapter(config);
} else if (engineType === 'nanobot') {
  return new NanobotAdapter(config);
}
```

#### 3) 抽象统一的 Agent 接口

```typescript
// 建议：创建统一的 Agent 接口
interface IAgentAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: string): Promise<void>;
  onMessage(callback: (event: AgentEvent) => void): void;
  setModel?(model: string): Promise<void>;
  setMode?(mode: string): Promise<void>;
}

// OpenClaw 适配器
class OpenClawAdapter implements IAgentAdapter {
  // WebSocket 实现
}

// Nanobot 适配器
class NanobotAdapter implements IAgentAdapter {
  // HTTP API 实现
}
```

#### 4) OpenClaw 保持现状 + ACP 接入其他 Agent（推荐架构）

**核心思想**：OpenClaw 保持现有 WebSocket 协议不变，通过 Bridge 层的 ACP 适配器接入 Claude、Codex、Goose 等原生支持 ACP 的 Agent。

```
Frontend → Gateway → Bridge ─┬→ OpenClaw (WebSocket) [现有，不动]
                              │
                              ├→ Claude Code (stdio ACP) [新增]
                              ├→ Codex (stdio ACP) [新增]
                              ├→ Goose (stdio ACP) [新增]
                              ├→ Qwen (stdio ACP) [新增]
                              └→ Nanobot (HTTP → ACP 适配) [新增]
```

**实现方案**：

```typescript
// bridge/index.ts
class BridgeServer {
  // 现有 OpenClaw 连接（完全不动）
  private openclaw = new OpenClawConnection();

  // 新增：ACP Agent 管理器
  private acpAgents = new AcpAgentManager();

  async routeMessage(agentType: string, sessionId: string, message: string) {
    switch (agentType) {
      case 'openclaw':
        // 现有代码完全不动
        return this.openclaw.send(sessionId, message);

      case 'claude':
      case 'codex':
      case 'goose':
        // 通过 ACP 发送
        const agent = this.acpAgents.get(agentType);
        return agent.sessionPrompt(sessionId, message);
    }
  }
}

// bridge/acp/AcpAgentManager.ts
export class AcpAgentManager {
  private agents: Map<string, AcpAdapter> = new Map();

  constructor() {
    this.agents.set('claude', new ClaudeAcpAdapter());
    this.agents.set('codex', new CodexAcpAdapter());
    this.agents.set('goose', new GooseAcpAdapter());
    this.agents.set('nanobot', new NanobotAcpAdapter());
  }
}
```

**收益**：
- OpenClaw 现有功能 100% 保留，无风险
- 可同时运行 OpenClaw 和其他 ACP Agent
- 工具调用、权限请求统一为 ACP 标准格式
- 前端 UI 可复用 AionUi 的 ACP 组件

### 12.3 推荐的实现路径

1. **阶段 1**: 部署时选择（环境变量配置）
   - 构建不同的容器镜像（openclaw / nanobot-ts）
   - Bridge 层根据 `AGENT_ENGINE` 环境变量加载对应适配器

2. **阶段 2** (可选): 创建时选择
   - 在 Agent 模型中增加 `engine_type` 字段
   - Platform Gateway 根据 engine_type 启动对应镜像
   - 需要统一的状态管理和 API 抽象层

---

## 13. 总结

AionUi 的多 Agent 架构核心优势：

1. **协议统一**: 使用 ACP 协议作为通用接口，不同 Agent 通过适配器接入
2. **配置驱动**: 集中式的 Agent 配置注册表，便于管理和扩展
3. **自动检测**: 启动时自动检测本地已安装的 CLI 工具
4. **扩展系统**: 允许第三方通过扩展贡献新的 Agent 适配器
5. **模式抽象**: 统一的模式切换机制（YOLO/Plan/Default）

对于 MultiUserClaw，建议采用**部署时选择**方案，通过环境变量配置 Agent 引擎类型，并在 Bridge 层实现统一的适配器接口，这样可以保持架构简洁同时保留未来扩展的灵活性。

---

## 参考文件

### 核心架构
- AionUi Source: `/tmp/aionui/`
- 核心类型定义: `src/types/acpTypes.ts`
- ACP Agent 实现: `src/agent/acp/index.ts`
- ACP 连接管理: `src/agent/acp/AcpConnection.ts`
- 自动检测: `src/agent/acp/AcpDetector.ts`
- OpenClaw 适配: `src/agent/openclaw/index.ts`
- Nanobot 适配: `src/agent/nanobot/index.ts`

### MCP 共享机制
- MCP 服务: `src/process/services/mcpServices/McpService.ts`
- MCP Agent 实现: `src/process/services/mcpServices/agents/`
- MCP 前端 Hook: `src/renderer/hooks/mcp/useMcpOperations.ts`
- MCP Agent 状态: `src/renderer/hooks/mcp/useMcpAgentStatus.ts`

### 会话管理
- 会话恢复 (OpenClaw): `src/agent/openclaw/index.ts`
- 会话恢复 (ACP): `src/agent/acp/AcpConnection.ts`
- 会话配置: `src/agent/acp/index.ts`

### 前端 UI
- 消息列表: `src/renderer/messages/MessageList.tsx`
- ACP 工具调用: `src/renderer/messages/acp/MessageAcpToolCall.tsx`
- 权限请求: `src/renderer/messages/acp/MessageAcpPermission.tsx`
- 计划消息: `src/renderer/messages/MessagePlan.tsx`
- 聊天布局: `src/renderer/pages/conversation/ChatLayout.tsx`
- 会话标签: `src/renderer/pages/conversation/ConversationTabs.tsx`

### 扩展系统
- 扩展类型: `src/extensions/types.ts`
- ACP 适配器解析: `src/extensions/resolvers/AcpAdapterResolver.ts`
- 模式配置: `src/renderer/constants/agentModes.ts`

### 技能管理
- Skill Manager: `src/process/task/AcpSkillManager.ts`
