#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Read pinned versions from package.json
NODE_VERSION=$(node -e "const p=require('$CLAUDE_PROJECT_DIR/package.json'); console.log(p.volta?.node || p.engines?.node || '24')")
PNPM_VERSION=$(node -e "const p=require('$CLAUDE_PROJECT_DIR/package.json'); console.log(p.volta?.pnpm || p.engines?.pnpm || '10')")

# Ensure nvm is available and install the pinned Node version
export NVM_DIR="/opt/nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VERSION" --no-progress
  nvm use "$NODE_VERSION"
  # Persist the correct node/npm on PATH for the rest of this session
  echo "export NVM_DIR=\"/opt/nvm\"" >> "$CLAUDE_ENV_FILE"
  echo "source \"\$NVM_DIR/nvm.sh\"" >> "$CLAUDE_ENV_FILE"
  echo "nvm use $NODE_VERSION --silent" >> "$CLAUDE_ENV_FILE"
fi

# Install/update pnpm to the pinned version
npm install -g "pnpm@$PNPM_VERSION" --silent

# Install project dependencies
cd "$CLAUDE_PROJECT_DIR"
pnpm install
