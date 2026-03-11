#!/bin/bash
set -e

# Create necessary directories
mkdir -p ~/.openclaw/workspace
mkdir -p ~/.openclaw/uploads
mkdir -p ~/.openclaw/sessions
mkdir -p ~/.openclaw/skills

# Install platform built-in skills (always overwrite to keep up-to-date)
PLATFORM_SKILLS_DIR="/app/skills"
if [ -d "$PLATFORM_SKILLS_DIR" ]; then
  cp -r "$PLATFORM_SKILLS_DIR/"* ~/.openclaw/skills/ 2>/dev/null || true
  echo "[entrypoint] Platform skills synced"
fi

# If NANOBOT_PROXY__URL is set, we're running in platform mode
if [ -n "$NANOBOT_PROXY__URL" ]; then
  echo "[entrypoint] Platform mode detected"
  echo "[entrypoint] Proxy URL: $NANOBOT_PROXY__URL"
  echo "[entrypoint] Model: $NANOBOT_AGENTS__DEFAULTS__MODEL"
fi

exec "$@"
