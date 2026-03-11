# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MultiUserClaw is a multi-tenant AI assistant platform built on OpenClaw. It supports container-isolated user environments, multiple LLM providers, and a web-based chat interface.

**Architecture Flow:**
```
Browser (Frontend :3080)
    → Platform Gateway (FastAPI :8080)
        → User Containers (OpenClaw + Bridge, per-user isolation)
            → LLM Providers (via Gateway proxy with API key injection)
```

## Development Commands

### Local Development (All Services)
```bash
# Start all services (PostgreSQL, Bridge, Gateway, Frontend)
python start_local.py

# Start specific services only
python start_local.py --only db,gateway,frontend

# Skip specific services
python start_local.py --skip bridge

# Stop all services
python start_local.py --stop
```

### Docker Deployment
```bash
# Prepare environment
python prepare.py

# Build and start all services
docker compose up -d --build

# Rebuild specific services
docker compose build --no-cache gateway && docker compose up -d

# View logs
docker compose logs -f

# Check service status
python check_status.py
```

### Platform Gateway (Python/FastAPI)
```bash
cd platform
# Install dependencies
pip install -e .[dev]

# Run with auto-reload
export PLATFORM_DATABASE_URL="postgresql+asyncpg://nanobot:nanobot@localhost:5432/nanobot_platform"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

# Run tests
pytest
```

### Frontend (Vite/React/TypeScript)
```bash
cd frontend
npm install
npm run dev      # Development server on port 3080
npm run build    # Production build
npm run lint     # ESLint
```

### OpenClaw Bridge (TypeScript/Node.js)
```bash
cd bridge
npm install
tsx start.ts          # Start bridge + OpenClaw Gateway (dev mode)

# Build bridge
npx tsc
```

## Key Components

### Platform Gateway (`platform/`)
Python FastAPI application - the control center for multi-tenant management.

| Module | File | Purpose |
|--------|------|---------|
| Auth | `app/auth/service.py` | JWT + bcrypt authentication |
| Container Mgmt | `app/container/manager.py` | Docker API for user container lifecycle |
| LLM Proxy | `app/llm_proxy/service.py` | API key injection, quota checking, usage tracking |
| HTTP/WS Proxy | `app/routes/proxy.py` | Forward requests to user containers |

**Container Lifecycle:**
- First chat → `create_container()` (Docker volume + container)
- Idle 30 min → pause (release CPU)
- Re-access → unpause (instant recovery)
- Idle 30 days → archive

### OpenClaw Bridge (`bridge/`)
Adapter layer connecting Platform Gateway to OpenClaw Agent Engine.

| File | Purpose |
|------|---------|
| `start.ts` | Entry point: write config → start OpenClaw Gateway → start HTTP server |
| `server.ts` | Express HTTP server + WebSocket relay |
| `gateway-client.ts` | WS client to local OpenClaw Gateway (Ed25519 handshake) |
| `config.ts` | Environment variable parsing, config file generation |
| `routes/*.ts` | REST API endpoints (sessions, skills, plugins, cron, etc.) |

### Frontend (`frontend/`)
Vite + React + TypeScript web interface with Tailwind CSS.

Key pages: Dashboard, Chat, Sessions, Agents, SkillStore, AIModels, Login/Register.

## Environment Configuration

Create `.env` in project root (see `.env.example`):

```bash
# Required: At least one LLM provider API key
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
DASHSCOPE_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx

# Optional: Default model for new users
DEFAULT_MODEL=dashscope/qwen3-coder-plus

# Security: JWT signing secret (change in production!)
JWT_SECRET=your-secure-random-string

# Self-hosted vLLM (optional)
HOSTED_VLLM_API_KEY=dummy
HOSTED_VLLM_API_BASE=http://localhost:8000/v1
```

## Service Ports

| Service | Port | Access |
|---------|------|--------|
| Frontend | 3080 | Public |
| Gateway | 8080 | Public |
| PostgreSQL | 15432 (Docker) / 5432 (local) | Internal |
| Bridge (container) | 18080 | Internal |
| OpenClaw Gateway (container) | 18789 | Loopback only |

## Security Architecture

- **API Keys**: All LLM API keys exist ONLY in Gateway environment variables. User containers access LLMs via proxy with container tokens.
- **Container Isolation**: Each user gets an independent Docker container with resource limits.
- **Authentication Chain**: Frontend JWT → Gateway → Container Token (one-time, identifies container only).
- **Network**: User containers run in `openclaw-internal` network, LLM access via Gateway proxy.

## WebSocket Protocol

Frontend → Gateway → Bridge → OpenClaw Gateway (layered proxy):

```json
// Send message
{ "type": "req", "id": 1, "method": "chat.send", "params": { "sessionKey": "...", "message": "..." } }

// Receive event
{ "type": "event", "event": "chat.message.received", "payload": { "content": "..." } }

// Heartbeat
{ "type": "ping" } / { "type": "pong" }
```
