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

**Formatter & Linter:**
- **Formatter**: ruff (line length: 100)
- **Linter**: ruff with rules `E, F, I, N, W` (ignore E501)

**Type Hints:**
- Use Pydantic v2 models for request/response validation
- Prefer explicit types over `Any`
- Use `Union[X, Y]` instead of `X | Y` for Python 3.11 compatibility
- Optional parameters: `X | None` (3.11+) or `Optional[X]` (legacy)

**Imports:**
- Follow PEP 8, use isort-compatible ordering
- Order: standard library → third-party → local application
- Example:
  ```python
  import asyncio
  from pathlib import Path

  import httpx
  from fastapi import APIRouter, Depends, HTTPException
  from pydantic import BaseModel, Field

  from app.db.models import Container
  from app.config import settings
  ```

**Async:**
- Use `asyncpg` for async PostgreSQL, `httpx` for HTTP
- Always use `async/await` in route handlers
- Use `AsyncSession` for SQLAlchemy

**Error Handling:**
- Never use bare `except:`, always catch specific exceptions
- Use custom exception classes for domain errors
- Log errors with context using `logging` module
- Return appropriate HTTP status codes (400 for bad request, 404 for not found, 500 for server errors)
- Example:
  ```python
  from fastapi import HTTPException

  async def get_user(db: AsyncSession, user_id: str) -> User:
      result = await db.execute(select(User).where(User.id == user_id))
      user = result.scalar_one_or_none()
      if user is None:
          raise HTTPException(status_code=404, detail="User not found")
      return user
  ```

**Testing:**
- pytest with pytest-asyncio (`asyncio_mode = "auto"`)
- Use `@pytest.mark.asyncio` for async tests
- Place tests in `tests/` directories

### TypeScript/JavaScript (Frontend & OpenClaw)

**Formatter & Linter:**
- **OpenClaw**: oxfmt + oxlint (type-aware)
- **Frontend**: Prettier + ESLint

**Strict Typing:**
- Avoid `any`, use explicit types
- Use `unknown` when type is uncertain, then narrow with type guards
- Prefer interfaces over types for object shapes

**ESM:**
- Use ES modules (`"type": "module"`)
- Use explicit `.js` extensions in imports when using ESM

**Node Version:**
- OpenClaw requires Node 22+

#### Frontend Specific

- **Framework**: React 19 with hooks
- **Styling**: Tailwind CSS v4
- **State**: Zustand for global state
- **Components**: Functional components with TypeScript
- **Imports**: Use path aliases (`@/` for src root)

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

**Naming:**
- Python: `snake_case` for functions/variables, `PascalCase` for classes
- TypeScript: `camelCase` for variables/functions, `PascalCase` for components/classes
- React Components: `PascalCase`
- File names: `snake_case.py` for Python, `camelCase.ts` for TypeScript

**Error Handling:**
- Always log errors with context, use proper exception types
- Include correlation IDs or request IDs in error logs
- Never expose internal error details to clients in production

**Configuration:**
- Environment variables with sensible defaults
- Use `.env` files for local development (add to `.gitignore`)
- Platform config: use `pydantic-settings` with `BaseSettings`

**Secrets:**
- Never commit secrets, use environment variables
- Store secrets in `.env` files (never commit these)
- Use `.env.example` for required variables template

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
