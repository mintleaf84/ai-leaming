#!/bin/sh
set -e

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
