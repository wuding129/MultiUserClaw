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
