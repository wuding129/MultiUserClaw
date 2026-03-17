FROM node:22-slim

# Install git (needed for marketplace git clone), psmisc (fuser, needed by --force), and Python
RUN apt-get update && apt-get install -y git psmisc python3 && rm -rf /var/lib/apt/lists/*

# Install openclaw globally (default 2026.3.8, override via build-arg)
ARG OPENCLAW_VERSION=2026.3.8
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Install bridge dependencies
WORKDIR /app
COPY package.json ./
RUN npm install

# Build bridge TypeScript
COPY tsconfig.json ./
COPY *.ts ./
COPY office/ ./office/
COPY routes/ ./routes/
RUN npx tsc

# Copy platform built-in skills
COPY skills/ ./skills/

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Entry point
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 18080 18789

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/start.js"]
