# nanobot-ts WhatsApp Bridge 详细文档

## 概述

`nanobot-ts` 是 MultiUserClaw 项目中的一个 TypeScript 组件，位于 `bridge/` 目录下。它是一个 WhatsApp Bridge（桥接服务），使用 Baileys 库连接 WhatsApp Web，并通过 WebSocket 与 Python 后端进行通信。

## 项目结构

```
bridge/
├── package.json          # 项目配置和依赖
├── tsconfig.json         # TypeScript 编译配置
└── src/
    ├── index.ts          # 入口文件，启动脚本
    ├── server.ts         # WebSocket 服务器实现
    ├── whatsapp.ts       # WhatsApp 客户端封装
    └── types.d.ts        # 类型声明文件
```

## 核心组件

### 1. index.ts - 入口文件

**功能**：
- 初始化并启动 Bridge 服务器
- 处理进程信号（SIGINT、SIGTERM）实现优雅关闭
- 配置环境变量

**环境变量**：
- `BRIDGE_PORT`: WebSocket 服务器端口，默认 `3001`
- `AUTH_DIR`: WhatsApp 认证文件存储目录，默认 `~/.nanobot/whatsapp-auth`

**启动方式**：
```bash
npm run build && npm start

# 或使用自定义配置
BRIDGE_PORT=3001 AUTH_DIR=~/.nanobot/whatsapp npm start
```

### 2. server.ts - WebSocket 服务器

**功能**：
- 创建 WebSocket 服务器，监听 Python 客户端连接
- 接收 Python 后端发送的发送消息命令
- 将 WhatsApp 消息、状态、QR 码广播给所有连接的 Python 客户端

**消息协议**：

**发送到 Python 客户端的消息格式**：
```typescript
// 收到新消息
{ type: 'message', id, sender, pn, content, timestamp, isGroup }

// 连接状态变化
{ type: 'status', status: 'connected' | 'disconnected' }

// QR 码更新
{ type: 'qr', qr: string }

// 发送错误
{ type: 'error', error: string }
```

**接收 Python 客户端的命令格式**：
```typescript
// 发送消息
{ type: 'send', to: string, text: string }

// 响应
{ type: 'sent', to: string }  // 发送成功
{ type: 'error', error: string }  // 发送失败
```

### 3. whatsapp.ts - WhatsApp 客户端

**功能**：
- 使用 Baileys 库连接 WhatsApp Web
- 处理 QR 码认证
- 接收和解析收到的消息
- 发送消息到 WhatsApp
- 自动重连机制

**核心类**：`WhatsAppClient`

**构造函数参数**：
```typescript
interface WhatsAppClientOptions {
  authDir: string;                    // 认证文件存储目录
  onMessage: (msg: InboundMessage) => void;  // 收到消息回调
  onQR: (qr: string) => void;         // QR 码更新回调
  onStatus: (status: string) => void; // 状态变化回调
}
```

**InboundMessage 接口**：
```typescript
interface InboundMessage {
  id: string;        // 消息 ID
  sender: string;    // 发送者 JID
  pn: string;        // 备用电话号码
  content: string;   // 消息内容
  timestamp: number; // 时间戳
  isGroup: boolean;  // 是否为群组消息
}
```

**支持的消息类型**：
- 纯文本消息 (`conversation`)
- 带链接预览的文本 (`extendedTextMessage`)
- 带标题的图片 (`imageMessage`)
- 带标题的视频 (`videoMessage`)
- 带标题的文档 (`documentMessage`)
- 语音/音频消息 (`audioMessage`)

**重连机制**：
- 当连接意外关闭时（`statusCode !== DisconnectReason.loggedOut`），5 秒后自动重连
- 避免在已注销情况下无限重连

### 4. types.d.ts - 类型声明

为 `qrcode-terminal` 库提供类型声明。

## 技术栈

- **运行时**: Node.js >= 20.0.0
- **语言**: TypeScript (ES2022)
- **WhatsApp 库**: @whiskeysockets/baileys 7.0.0-rc.9
- **WebSocket**: ws ^8.17.1
- **日志**: pino ^9.0.0
- **QR 码显示**: qrcode-terminal ^0.12.0

## TypeScript 配置

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

## 工作流程

### 1. 启动流程

```
index.ts
  ↓
创建 BridgeServer (port, authDir)
  ↓
server.start()
  ↓
1. 创建 WebSocket 服务器
2. 初始化 WhatsAppClient
3. 连接到 WhatsApp Web
```

### 2. 消息接收流程

```
WhatsApp 用户发送消息
  ↓
Baileys 库接收消息 (messages.upsert 事件)
  ↓
whatsapp.ts 解析消息内容
  ↓
调用 onMessage 回调
  ↓
server.ts 广播给所有 Python 客户端
  ↓
Python 后端处理消息
```

### 3. 消息发送流程

```
Python 后端发送 WebSocket 消息
  ↓
server.ts 接收命令
  ↓
调用 whatsapp.sendMessage()
  ↓
Baileys 库发送消息到 WhatsApp
  ↓
返回发送结果给 Python 客户端
```

### 4. 认证流程

```
首次启动
  ↓
Baileys 生成 QR 码
  ↓
在终端显示 QR 码 (qrcode-terminal)
  ↓
通过 onQR 回调广播给 Python 客户端
  ↓
用户用 WhatsApp 扫描 QR 码
  ↓
认证成功，保存凭证到 authDir
  ↓
后续启动自动使用保存的凭证
```

## 与 Python 后端的集成

Bridge 作为中间层，Python 后端通过 WebSocket 连接：

```python
import asyncio
import websockets
import json

async def connect_bridge():
    uri = "ws://localhost:3001"
    async with websockets.connect(uri) as ws:
        # 接收消息
        async for message in ws:
            data = json.loads(message)
            if data['type'] == 'message':
                print(f"收到消息: {data['content']}")
            elif data['type'] == 'qr':
                print(f"QR码: {data['qr']}")
            elif data['type'] == 'status':
                print(f"状态: {data['status']}")

        # 发送消息
        await ws.send(json.dumps({
            'type': 'send',
            'to': 'user@whatsapp.net',
            'text': 'Hello!'
        }))
```

## 注意事项

1. **认证文件**：首次运行后，认证信息会保存在 `AUTH_DIR` 目录中，后续启动会自动使用
2. **QR 码时效**：QR 码通常有时效限制，需要尽快扫描
3. **重连逻辑**：程序会自动处理连接断开，但不会在用户主动注销后重连
4. **消息过滤**：
   - 自动过滤自己发送的消息 (`msg.key.fromMe`)
   - 自动过滤状态更新 (`status@broadcast`)
5. **ESM 模块**：项目使用 ESM 模块系统，需要 Node.js >= 20.0.0

## 依赖关系图

```
index.ts
  ├── server.ts (BridgeServer)
  │   ├── ws (WebSocketServer)
  │   └── whatsapp.ts (WhatsAppClient)
  │       └── @whiskeysockets/baileys
  └── qrcode-terminal (类型声明)
```

## 常见问题

### Q: 如何修改端口？
A: 设置环境变量 `BRIDGE_PORT=3002 npm start`

### Q: 认证失败怎么办？
A: 删除 `AUTH_DIR` 目录下的文件，重新启动并扫描新的 QR 码

### Q: 如何查看详细日志？
A: 修改 `whatsapp.ts` 中的 pino 日志级别：
```typescript
const logger = pino({ level: 'debug' });
```

### Q: 支持群组消息吗？
A: 是的，通过 `isGroup` 字段可以区分群组消息和私聊消息

---

# 第二部分：与 OpenClaw 对齐方案

## OpenClaw Bridge 功能对比

当前 `nanobot-ts` 是一个轻量级的 WhatsApp Bridge，功能相对简单。OpenClaw 的 Bridge 提供了更丰富的功能，主要包括：

| 功能模块 | nanobot-ts (当前) | OpenClaw Bridge |
|---------|------------------|-----------------|
| WhatsApp 连接 | ✅ 基础连接 | ✅ 完整实现 |
| 消息收发 | ✅ 文本消息 | ✅ 文本+媒体+附件 |
| 通道管理 | ❌ | ✅ 多种通道配置 |
| 智能体管理 | ❌ | ✅ CRUD 操作 |
| 会话管理 | ❌ | ✅ 会话历史 |
| 定时任务 | ❌ | ✅ Cron 任务 |
| 插件系统 | ❌ | ✅ 插件管理 |
| 技能系统 | ❌ | ✅ Skill 管理 |
| 文件管理 | ❌ | ✅ 文件上传下载 |
| 工作区 | ❌ | ✅ 工作区管理 |
| 命令系统 | ❌ | ✅ 命令注册 |
| 设置管理 | ❌ | ✅ 配置管理 |
| 市场集成 | ❌ | ✅ 技能市场 |

## 对齐方案：分层架构设计

为了保持轻量可定制的同时对齐 OpenClaw 核心功能，建议采用**分层架构**：

```
┌─────────────────────────────────────────────────────────────┐
│                    MultiUserClaw Platform                   │
│                    (Python FastAPI 后端)                    │
├─────────────────────────────────────────────────────────────┤
│                      Bridge API Layer                       │
│              (Express.js HTTP + WebSocket)                  │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│  WhatsApp   │  通道管理   │  智能体    │   技能/插件      │
│  Channel    │  Module     │  Module    │   Module         │
├─────────────┴─────────────┴─────────────┴──────────────────┤
│                   Core Module (共享)                        │
│         消息处理 / 认证 / 重连 / 事件分发                   │
├─────────────────────────────────────────────────────────────┤
│              WhatsApp Client (Baileys)                     │
└─────────────────────────────────────────────────────────────┘
```

### 推荐的模块结构

```
bridge/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                    # 入口文件
    ├── server.ts                   # HTTP + WebSocket 服务器
    ├── types.d.ts                  # 类型声明
    │
    ├── core/                       # 核心模块 (轻量共享)
    │   ├── whatsapp.ts             # WhatsApp 客户端 (当前)
    │   ├── message-parser.ts       # 消息解析器
    │   ├── auth-store.ts           # 认证存储 (参考 OpenClaw)
    │   └── event-bus.ts            # 事件总线
    │
    ├── channels/                   # 通道模块
    │   ├── whatsapp/
    │   │   ├── inbound.ts          # 消息入口处理
    │   │   ├── outbound.ts         # 消息发送
    │   │   ├── media.ts            # 媒体处理
    │   │   └── access-control.ts   # 访问控制
    │   └── registry.ts             # 通道注册表
    │
    ├── modules/                    # 业务模块 (按需启用)
    │   ├── agents/                 # 智能体管理
    │   │   └── routes.ts
    │   ├── sessions/               # 会话管理
    │   │   └── routes.ts
    │   ├── skills/                 # 技能管理
    │   │   └── routes.ts
    │   ├── plugins/                # 插件管理
    │   │   └── routes.ts
    │   ├── cron/                   # 定时任务
    │   │   └── routes.ts
    │   ├── files/                  # 文件管理
    │   │   └── routes.ts
    │   └── commands/               # 命令系统
    │       └── routes.ts
    │
    └── gateway/                    # Gateway 客户端 (可选)
        └── client.ts               # 连接 OpenClaw Gateway
```

## 核心增强功能

### 1. 消息处理增强

参考 OpenClaw 实现，增加以下功能：

```typescript
// src/core/message-parser.ts
export interface ParsedMessage {
  id: string;
  key: MessageKey;
  sender: string;
  senderName?: string;
  content: MessageContent;
  timestamp: number;
  isGroup: boolean;
  isMention?: boolean;
  isReply?: boolean;
  replyTo?: string;
  media?: MediaInfo;
}

export interface MediaInfo {
  type: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  url?: string;
  caption?: string;
  thumbnail?: string;
}

// 支持的消息类型扩展
- 位置消息 (locationMessage)
- 联系人消息 (contactMessage)
- 动态表情 (reactionMessage)
- 消息撤回 (protocolMessage)
- 群组邀请 (groupInviteMessage)
```

### 2. 认证存储增强

参考 OpenClaw 的 `auth-store.ts`，增加凭证备份和恢复：

```typescript
// src/core/auth-store.ts
export interface AuthStore {
  // 凭证保存 (带备份)
  saveCreds(creds: Creds): Promise<void>;

  // 凭证加载
  loadCreds(): Promise<Creds | null>;

  // 凭证备份
  backupCreds(): Promise<void>;

  // 从备份恢复
  restoreFromBackup(): Promise<boolean>;

  // 检查认证状态
  hasValidCreds(): boolean;

  // 登出 (删除凭证)
  logout(): Promise<void>;
}
```

### 3. 事件总线

实现事件驱动架构，支持模块解耦：

```typescript
// src/core/event-bus.ts
export type EventType =
  | 'message.received'
  | 'message.sent'
  | 'message.failed'
  | 'message.ack'
  | 'connection.status'
  | 'qr.updated'
  | 'media.downloaded'
  | 'group.joined'
  | 'group.left';

export interface BridgeEvent {
  type: EventType;
  payload: unknown;
  timestamp: number;
}

export class EventBus {
  subscribe(event: EventType, handler: (event: BridgeEvent) => void): () => void;
  publish(event: BridgeEvent): void;
}
```

### 4. 通道配置管理

```typescript
// src/channels/whatsapp/config.ts
export interface WhatsAppConfig {
  // 连接配置
  authDir: string;

  // 消息配置
  allowGroups: boolean;
  allowDMs: boolean;
  allowFrom?: string[];        // 白名单
  blockFrom?: string[];        // 黑名单

  // 自动回复配置
  autoReply?: boolean;
  autoReplyDelay?: number;

  // 媒体配置
  downloadMedia?: boolean;
  mediaStoragePath?: string;

  // 高级配置
  syncFullHistory?: boolean;
  markOnlineOnConnect?: boolean;
}
```

## 与 MultiUserClaw 集成方案

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                      MultiUserClaw                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │   Frontend      │  │   Platform API  │  │  Agent Engine  │  │
│  │   (React)       │  │   (FastAPI)     │  │  (Python)      │  │
│  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │    Bridge API         │                    │
│                    │  (Express + WS)       │                    │
│                    │  Port: 18080          │                    │
│                    └───────────┬───────────┘                    │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │   nanobot-ts          │                    │
│                    │   (WhatsApp Bridge)   │                    │
│                    │   Port: 3001          │                    │
│                    └───────────┬───────────┘                    │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │   WhatsApp Web        │                    │
│                    │   (Baileys)           │                    │
│                    └───────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### 集成方式

#### 方案 A：独立进程模式 (当前)

Bridge 作为独立进程运行，通过 WebSocket 与 Python 后端通信。

**优点**：
- 简单直接，易于部署
- Bridge 可以独立升级
- 故障隔离

**缺点**：
- 需要维护两个进程
- 通信有一定延迟

#### 方案 B：嵌入式模式 (推荐)

将 nanobot-ts 编译为 Python 可调用的服务，通过 HTTP API 通信。

```python
# Python 端调用示例
import httpx

class WhatsAppBridgeClient:
    def __init__(self, base_url: str = "http://localhost:18080"):
        self.base_url = base_url

    async def send_message(self, to: str, text: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/whatsapp/send",
                json={"to": to, "text": text}
            )
            return response.json()

    async def get_status(self) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/api/whatsapp/status")
            return response.json()

    async def upload_media(self, file_path: str) -> dict:
        async with httpx.AsyncClient() as client:
            with open(file_path, 'rb') as f:
                response = await client.post(
                    f"{self.base_url}/api/whatsapp/media",
                    files={"file": f}
                )
            return response.json()
```

#### 方案 C：OpenClaw Gateway 模式

通过 BridgeGatewayClient 连接 OpenClaw Gateway，共享智能体能力。

```typescript
// src/gateway/client.ts
import { BridgeGatewayClient } from './gateway-client.js';

const client = new BridgeGatewayClient('ws://127.0.0.1:18789');

// 连接 Gateway
await client.start();

// 调用 Gateway 方法
const agents = await client.request('agents.list', {});
const sessions = await client.request('sessions.list', { agentId: 'xxx' });

// 监听事件
client.onEvent((evt) => {
  if (evt.event === 'message.received') {
    // 处理消息
  }
});
```

### API 设计

建议扩展 Bridge API，支持更多功能：

```typescript
// HTTP API (Express)
GET  /api/health                    # 健康检查
GET  /api/whatsapp/status           # WhatsApp 连接状态
GET  /api/whatsapp/qr               # 获取当前 QR 码
POST /api/whatsapp/send             # 发送消息
POST /api/whatsapp/send-media       # 发送媒体
POST /api/whatsapp/logout           # 登出
GET  /api/channels                  # 通道列表
GET  /api/channels/:type/status     # 通道状态
PUT  /api/channels/:type/config     # 配置通道

// WebSocket API
{ type: 'message', ... }            # 收到消息
{ type: 'status', ... }             # 状态变化
{ type: 'qr', ... }                 # QR 码更新
{ type: 'event', event, payload }   # 通用事件
```

### 配置管理

```typescript
// src/config.ts
export interface BridgeConfig {
  // 服务器配置
  port: number;
  host: string;

  // WhatsApp 配置
  whatsapp: WhatsAppConfig;

  // 通道配置
  channels: Record<string, ChannelConfig>;

  // Gateway 配置 (可选)
  gateway?: {
    url: string;
    token?: string;
  };

  // 存储配置
  storage: {
    authDir: string;
    mediaDir: string;
    sessionsDir: string;
  };

  // 日志配置
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
}
```

## 轻量可定制策略

### 1. 模块化设计

每个功能模块独立，可以通过配置启用/禁用：

```typescript
// 按需加载模块
const modules = {
  agents: true,      // 启用智能体管理
  sessions: true,   // 启用会话管理
  skills: false,    // 禁用技能管理
  plugins: false,   // 禁用插件系统
  cron: false,      // 禁用定时任务
};

for (const [name, enabled] of Object.entries(modules)) {
  if (enabled) {
    const route = await import(`./modules/${name}/routes.js`);
    app.use('/api', route.default(client, config));
  }
}
```

### 2. 插件系统

支持自定义插件扩展功能：

```typescript
// src/plugins/loader.ts
interface Plugin {
  name: string;
  version: string;
  init: (context: PluginContext) => Promise<void>;
  handlers?: {
    onMessage?: (msg: ParsedMessage) => Promise<void>;
    onSend?: (msg: OutboundMessage) => Promise<void>;
  };
}

// 插件加载
async function loadPlugins(pluginsDir: string): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  for (const file of readdirSync(pluginsDir)) {
    if (file.endsWith('.js')) {
      const plugin = await import(join(pluginsDir, file));
      plugins.push(plugin.default);
    }
  }
  return plugins;
}
```

### 3. 事件钩子

支持在关键节点插入自定义逻辑：

```typescript
// 消息处理钩子
const hooks = {
  'message:received': [],
  'message:before-send': [],
  'message:after-send': [],
  'connection:changed': [],
};

function registerHook(event: string, handler: Function) {
  hooks[event].push(handler);
}

async function executeHooks(event: string, data: unknown) {
  for (const handler of hooks[event]) {
    await handler(data);
  }
}
```

## 实施路线图

### Phase 1: 基础增强 (1-2 周)

- [ ] 消息解析器增强 (支持更多消息类型)
- [ ] 认证存储改进 (备份/恢复)
- [ ] 事件总线实现
- [ ] 基础 HTTP API

### Phase 2: 通道功能 (2-3 周)

- [ ] 媒体处理 (图片/视频/音频/文档)
- [ ] 访问控制 (白名单/黑名单)
- [ ] 群组管理
- [ ] 自动回复基础

### Phase 3: 业务模块 (3-4 周)

- [ ] 会话管理
- [ ] 智能体管理 (基础)
- [ ] 命令系统

### Phase 4: 高级功能 (4-6 周)

- [ ] 技能系统
- [ ] 插件系统
- [ ] 定时任务
- [ ] Gateway 集成 (可选)

## 总结

通过以上方案，可以实现：

1. **轻量**: 基础版本只包含 WhatsApp 连接和消息收发
2. **可定制**: 模块化设计，按需启用功能
3. **对齐 OpenClaw**: 核心功能与 OpenClaw 保持一致
4. **易于集成**: 多种集成方式适配不同场景
