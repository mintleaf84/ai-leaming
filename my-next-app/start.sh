#!/bin/sh
set -e

# 0. Zero-Config Security: Auto-generate JWT_SECRET if missing
# We store it in the persistent /app/data directory to ensure it survives restarts
ENV_FILE="/app/data/.env.production"
if [ -z "$JWT_SECRET" ]; then
    if [ -f "$ENV_FILE" ]; then
        echo "🔐 Loading persisted JWT_SECRET from $ENV_FILE"
        . "$ENV_FILE"
        export JWT_SECRET
    else
        echo "🎲 JWT_SECRET is missing. Generating a strong random secret..."
        # Use openssl (installed in Dockerfile) to generate a 32-byte base64 string
        NEW_SECRET=$(openssl rand -base64 32)
        echo "JWT_SECRET=\"$NEW_SECRET\"" > "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        export JWT_SECRET="$NEW_SECRET"
        echo "✅ Generated and persisted new JWT_SECRET to $ENV_FILE"
    fi
fi

# 1. Run Migrations
echo "🔄 Running database migrations..."
if command -v tsx >/dev/null 2>&1; then
  tsx scripts/migrate-runner.ts
else
  # 降级到 npx tsx 作为备选措施
  npx tsx scripts/migrate-runner.ts
fi

# 2. Start Application
echo "🚀 Starting application..."
node server.js
