#!/bin/sh
set -e

# 1. Run Migrations
echo "🔄 Running database migrations..."
npm run db:migrate

# 2. Start Application
echo "🚀 Starting application..."
node server.js
