#!/bin/sh
set -e

# 0. Zero-Config Security: auto-generate missing secrets
# 持久化在 /app/data 下，重启/升级不变（两个密钥共用同一个文件）
ENV_FILE="/app/data/.env.production"

# 先加载已持久化的密钥：显式传入的环境变量优先，其次才是文件里的值
if [ -f "$ENV_FILE" ]; then
    echo "🔐 Loading persisted secrets from $ENV_FILE"
    . "$ENV_FILE"
    if [ -n "$JWT_SECRET" ]; then export JWT_SECRET; fi
    if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then export BACKUP_ENCRYPTION_KEY; fi
fi

if [ -z "$JWT_SECRET" ]; then
    echo "🎲 JWT_SECRET is missing. Generating a strong random secret..."
    NEW_SECRET=$(openssl rand -base64 32)
    echo "JWT_SECRET=\"$NEW_SECRET\"" >> "$ENV_FILE"
    export JWT_SECRET="$NEW_SECRET"
    echo "✅ Generated and persisted new JWT_SECRET to $ENV_FILE"
fi

# WebDAV 备份密码用它加解密。缺失时备份功能不可用（页面会明确提示），
# 且**不能**用内置默认值 —— 那是公开字符串，等于明文存密码。
if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
    echo "🎲 BACKUP_ENCRYPTION_KEY is missing. Generating a strong random secret..."
    NEW_BACKUP_KEY=$(openssl rand -base64 32)
    echo "BACKUP_ENCRYPTION_KEY=\"$NEW_BACKUP_KEY\"" >> "$ENV_FILE"
    export BACKUP_ENCRYPTION_KEY="$NEW_BACKUP_KEY"
    echo "✅ Generated and persisted BACKUP_ENCRYPTION_KEY to $ENV_FILE"
fi

chmod 600 "$ENV_FILE" 2>/dev/null || true

# 1. Run Migrations
echo "🔄 Running database migrations..."
if [ -f "migrate-runner.js" ]; then
  node migrate-runner.js
else
  echo "⚠️ migrate-runner.js not found, skipping migration."
fi

# 2. Start Application
echo "🚀 Starting application..."
node server.js
