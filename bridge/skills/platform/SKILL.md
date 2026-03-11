---
name: platform
description: "Manage skills, browse curated recommendations, and use platform services. Use when: user asks to install/search/manage skills, view platform curated skills, or use platform-specific features."
metadata: { "openclaw": { "requires": { "bins": ["curl"] } } }
---

# Platform Services

This skill provides access to the multi-user platform's shared services. All API calls go through the local bridge at `http://localhost:18080`.

## When to Use

- User asks to install a skill / search for skills
- User asks about recommended/curated skills
- User wants to submit a skill for platform review
- User asks about platform capabilities

## 1. Curated Skills (Platform Recommended)

The platform maintains a curated list of tested, recommended skills.

### List curated skills

```bash
curl -s http://localhost:18080/api/curated-skills | python3 -m json.tool
```

Response is a JSON array. Each skill has:
- `id` — unique ID (needed for install)
- `name` — skill name
- `description` — what it does
- `author` — who made it
- `category` — category tag
- `is_featured` — whether it's a staff pick
- `install_count` — how popular it is
- `installed` — whether it's already installed in this container

### Install a curated skill

```bash
curl -s -X POST http://localhost:18080/api/curated-skills/<SKILL_ID>/install | python3 -m json.tool
```

Replace `<SKILL_ID>` with the `id` from the list above.

### Submit a skill for platform review

If the user has created or found a useful skill, submit it for admin review:

```bash
curl -s -X POST http://localhost:18080/api/curated-skills/submit \
  -H "Content-Type: application/json" \
  -d '{"skill_name": "my-skill", "description": "What it does", "source_url": "https://..."}' \
  | python3 -m json.tool
```

### Check my submissions

```bash
curl -s http://localhost:18080/api/curated-skills/submissions/mine | python3 -m json.tool
```

## 2. Marketplace Skills (skills.sh)

Search and install community skills from the public marketplace.

### Search

```bash
curl -s -X POST http://localhost:18080/api/marketplaces/skills/search \
  -H "Content-Type: application/json" \
  -d '{"query": "SEARCH_TERM", "limit": 10}' \
  | python3 -m json.tool
```

Results include `slug`, `url`, and `installs` count.

### Install from marketplace

```bash
curl -s -X POST http://localhost:18080/api/marketplaces/skills/install \
  -H "Content-Type: application/json" \
  -d '{"slug": "owner/repo@skill-name"}' \
  | python3 -m json.tool
```

Or use the CLI directly:

```bash
npx --yes skills add owner/repo@skill-name -g -y --copy
```

## 3. Installed Skills

### List installed skills

```bash
curl -s http://localhost:18080/api/skills | python3 -m json.tool
```

### Check what's in the skills directory

```bash
ls ~/.openclaw/skills/
```

### Enable/disable a skill

```bash
# Enable
curl -s -X PUT http://localhost:18080/api/skills/SKILL_NAME/toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' | python3 -m json.tool

# Disable
curl -s -X PUT http://localhost:18080/api/skills/SKILL_NAME/toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' | python3 -m json.tool
```

### Agent-Specific Skills

Each agent can have its own skills. By default, skills are created for the "main" agent. Use the `X-Agent-Id` header to specify which agent's skills to manage.

**Skill storage locations:**
- Main agent: `~/.openclaw/workspace/skills/`
- Other agents: `~/.openclaw/workspace-<agentId>/skills/`

For example, skills for "coder" agent are stored in `~/.openclaw/workspace-coder/skills/`.

#### List skills for a specific agent

```bash
# List skills for "coder" agent (use X-Agent-Id header)
curl -s "http://localhost:18080/api/skills" \
  -H "X-Agent-Id: coder" | python3 -m json.tool

# List skills for "main" agent (default)
curl -s "http://localhost:18080/api/skills" | python3 -m json.tool
```

#### Upload skill to a specific agent

```bash
# Upload skill to "coder" agent
curl -s -X POST "http://localhost:18080/api/skills/upload" \
  -H "X-Agent-Id: coder" \
  -F "file=@my-skill.zip" | python3 -m json.tool
```

#### Delete skill from a specific agent

```bash
# Delete skill from "coder" agent
curl -s -X DELETE "http://localhost:18080/api/skills/my-skill" \
  -H "X-Agent-Id: coder" | python3 -m json.tool
```

#### Download skill from a specific agent

```bash
# Download skill from "coder" agent
curl -s "http://localhost:18080/api/skills/my-skill/download" \
  -H "X-Agent-Id: coder" -o my-skill.zip
```

**Important**: Always use the `X-Agent-Id` header to specify which agent's skills to operate on. This ensures each agent can only manage its own skills. If not specified, defaults to "main".

## 4. ClawHub Skills

ClawHub (clawhub.com) is another community skill registry. The `clawhub` skill (built-in from OpenClaw) teaches you how to use its CLI. If `clawhub` binary is not installed yet:

```bash
npm i -g clawhub
```

Then search and install:

```bash
clawhub search "postgres backups"
clawhub install my-skill
```

See the `clawhub` skill for full CLI usage.

## Workflow

When a user asks to install or find skills, search **all sources** in this order:

1. **Platform curated skills** — check first, these are platform-tested and recommended
2. **ClawHub** — community registry, search via `clawhub search`
3. **Marketplace (skills.sh)** — broad community skills, search via API or `npx skills find`
4. **After install** — tell the user the skill is ready to use (it takes effect immediately, no restart needed)

If the user has a specific skill name, check curated list first. If they describe a need ("I need something for web scraping"), search all three sources and present the best options together.

When presenting results, show them in a clean table format with name, description, source, and status.

## 5. Agent Management

You can create, view, update, and delete AI Agents. Each agent has its own workspace and can be configured with different models.

### List all agents

```bash
curl -s http://localhost:18080/api/agents | python3 -m json.tool
```

Response includes agent details: `id`, `name`, `identity`, `workspace`, etc.

### Create a new agent

```bash
curl -s -X POST http://localhost:18080/api/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "workspace": "~/.openclaw/workspace-myagent", "model": "claude-sonnet-4-5"}' \
  | python3 -m json.tool
```

Parameters:
- `name` (required): Agent ID, lowercase letters, numbers, underscores and hyphens only
- `workspace` (optional): Custom workspace path, defaults to `~/.openclaw/workspace-<name>`
- `model` (optional): Model to use, e.g., `claude-sonnet-4-5`, `gpt-4o`, `qwen-max`

### Update an agent

```bash
curl -s -X PUT http://localhost:18080/api/agents/AGENT_ID \
  -H "Content-Type: application/json" \
  -d '{"name": "new-name", "model": "gpt-4o"}' \
  | python3 -m json.tool
```

### ⚠️ Delete an Agent (Requires User Confirmation)

**Deleting an agent is IRREVERSIBLE!** Before calling the delete API, you MUST:

1. **Ask the user for confirmation first** in their language
2. **Explain what will be deleted** (the agent, its workspace, all conversation history)
3. **Wait for explicit confirmation** ("yes", "confirm", "是", "确认", etc.)
4. **Never delete without user consent**

Example workflow (Chinese user):
```
你：确定要删除 "insurance-agent" 吗？这将同时删除其工作区文件和所有对话历史，此操作无法撤销。

用户：是的，删除吧

你：（然后调用删除 API）
```

Example workflow (English user):
```
You: Are you sure you want to delete "insurance-agent"? This will also delete all its workspace files and conversation history. This action cannot be undone.

User: yes, delete it

You: (then call the delete API)
```

Delete command:

```bash
# Delete agent (keep workspace files)
curl -s -X DELETE "http://localhost:18080/api/agents/AGENT_ID" | python3 -m json.tool

# Delete agent AND workspace files
curl -s -X DELETE "http://localhost:18080/api/agents/AGENT_ID?delete_files=true" | python3 -m json.tool
```

### Get available models

```bash
curl -s http://localhost:18080/api/models | python3 -m json.tool
```

This returns available models from the platform with their providers.
