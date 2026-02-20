# ⚠️ IMPORTANT: API ROUTING ARCHITECTURE ⚠️

**DO NOT** create Next.js App Router API routes (`route.ts`) in this directory or its subdirectories.

This project relies exclusively on the **Hono** framework for all REST API endpoints.

If you need to create a new API endpoint:

1. Create it in `src/lib/api/routes/` using Hono.
2. Mount it in `src/app/api/[[...route]]/route.ts`.

Refer to the `hono-api-development` skill or `.cursorrules` for details.
