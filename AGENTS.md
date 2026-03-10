# MultiUserClaw - Agent Guidelines

MultiUserClaw is a multi-tenant AI assistant platform built on OpenClaw with container-isolated user environments, multiple LLM providers, and a web-based chat interface.

## Architecture Overview

```
Browser (Frontend :3080)
    → Platform Gateway (FastAPI :8080)
        → User Containers (OpenClaw + Bridge, per-user isolation)
            → LLM Providers (via Gateway proxy with API key injection)
```

## Project Components

| Component | Directory | Language | Port |
|-----------|-----------|----------|------|
| Platform Gateway | `platform/` | Python/FastAPI | 8080 |
| Frontend | `frontend/` | React/Vite/TypeScript | 3080 |
| OpenClaw Agent | `openclaw/` | TypeScript/Node.js | (in containers) |

---

## Development Commands

### All Services (Local Development)

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

# Run a single test
pytest path/to/test_file.py::test_function_name

# Lint (ruff)
ruff check .
ruff check path/to/file.py

# Format (ruff)
ruff format .
```

### Frontend (React/Vite/TypeScript)

```bash
cd frontend

# Install dependencies
npm install

# Development server
npm run dev      # Port 3080

# Production build
npm run build

# Lint
npm run lint

# Run a specific test file (via vitest)
npx vitest run path/to/test.spec.ts
```

### OpenClaw (TypeScript/Node.js)

```bash
cd openclaw

# Install dependencies (use pnpm)
pnpm install

# Build
pnpm build

# TypeScript check
pnpm tsgo

# Lint
pnpm check          # Full check (format + lint)
pnpm format:check   # Format check only
pnpm format:fix     # Fix formatting

# Tests
pnpm test                           # All tests
pnpm test:fast                      # Unit tests only
pnpm test:coverage                  # With coverage
pnpm test path/to/file.test.ts      # Single test file
pnpm vitest run --reporter=verbose path/to/file.test.ts::test_name  # Single test

# Dev mode
pnpm dev
pnpm gateway:dev    # Gateway only
```

---

## Code Style Guidelines

### Python (Platform)

- **Formatter**: ruff (line length: 100)
- **Linter**: ruff with rules `E, F, I, N, W` (ignore E501)
- **Type hints**: Use Pydantic v2 models, prefer explicit types
- **Imports**: Follow PEP 8, use isort-compatible ordering
- **Async**: Use `asyncpg` for async PostgreSQL, `httpx` for HTTP
- **Error handling**: Never use bare `except:`, always catch specific exceptions
- **Testing**: pytest with pytest-asyncio (`asyncio_mode = "auto"`)

Example:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api", tags=["auth"])

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=8)
```

### TypeScript/JavaScript (Frontend & OpenClaw)

- **Formatter**: oxfmt (OpenClaw), Prettier-compatible (Frontend)
- **Linter**: oxlint (type-aware), ESLint (Frontend)
- **Strict typing**: Avoid `any`, use explicit types
- **ESM**: Use ES modules (`"type": "module"`)
- **Node version**: 22+ for OpenClaw

#### Frontend Specific
- **Framework**: React 19 with hooks
- **Styling**: Tailwind CSS v4
- **State**: Zustand for global state
- **Components**: Functional components with TypeScript

Example:
```typescript
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // ...
}
```

#### OpenClaw Specific
- **Tool schemas**: Use TypeBox for validation schemas
- **Avoid**: `anyOf`/`oneOf`/`allOf` in tool schemas, use `stringEnum` instead
- **File size**: Aim for <500 LOC per file, split when needed

### General Conventions

- **Naming**:
  - Python: `snake_case` for functions/variables, `PascalCase` for classes
  - TypeScript: `camelCase` for variables/functions, `PascalCase` for components/classes
- **Error handling**: Always log errors with context, use proper exception types
- **Configuration**: Environment variables with sensible defaults, use `.env` files
- **Secrets**: Never commit secrets, use environment variables or .env files

---

## Database

- **PostgreSQL** for platform data (users, containers, quotas)
- **SQLAlchemy** (async) with Alembic for migrations
- Connection: `postgresql+asyncpg://user:pass@host:5432/dbname`

---

## Testing Guidelines

### Python Tests
- Located in `tests/` directories
- Use `pytest` framework
- Async tests: mark with `@pytest.mark.asyncio`
- Run: `pytest` or `pytest path/to/test.py::test_func`

### TypeScript Tests
- OpenClaw: Vitest with colocated `*.test.ts` files
- Frontend: Vitest
- Run: `pnpm test` or `vitest run path/to/file.test.ts`

---

## Key Files & Patterns

### Platform (`platform/app/`)
- `main.py` - FastAPI app entry
- `auth/service.py` - JWT authentication
- `container/manager.py` - Docker container lifecycle
- `llm_proxy/service.py` - LLM API key injection
- `routes/proxy.py` - HTTP/WS proxy to containers

### Frontend (`frontend/`)
- `app/` - Next.js-style app router pages
- `lib/api.ts` - API client (HTTP + WebSocket)

### OpenClaw Bridge (`openclaw/bridge/`)
- `start.ts` - Container startup entry
- `server.ts` - Express HTTP + WebSocket server
- `routes/` - REST API endpoints

---

## Environment Variables

Create `.env` in project root:

```bash
# Required: At least one LLM provider
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
DASHSCOPE_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx

# Optional
DEFAULT_MODEL=dashscope/qwen3-coder-plus
JWT_SECRET=your-secure-random-string
```

---

## Ports Reference

| Service | Port | Access |
|---------|------|--------|
| Frontend | 3080 | Public |
| Gateway | 8080 | Public |
| PostgreSQL | 5432 (15432 Docker) | Internal |
| Bridge (container) | 18080 | Internal |
| OpenClaw Gateway | 18789 | Loopback only |
