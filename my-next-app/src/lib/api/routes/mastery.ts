import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { masteryService } from '@/lib/services/mastery'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'

const app = new OpenAPIHono()

// --- Schemas ---

// Recursive schema definition in Zod is tricky for OpenAPI generation sometimes.
// simpler approach: output flat arrays or limited depth for API if recursive fails, 
// but let's try defining the node schema.
const _MasteryNodeSchema = z.object({
    name: z.string(),
    path: z.string(),
    score: z.number(),
    level: z.number()
})

// For the responding tree, we might just define it as a generic object or recursive if possible.
// Zod recursive:
// const NodeSchema: z.ZodType<MasteryTreeNode> = z.lazy(() => MasteryNodeSchema.extend({ children: z.array(NodeSchema) }))
// But for OpenAPI Hono, we might need 'z.array(z.any())' for children to avoid complexity if strict typing isn't needed for swagger UI deep nesting.
const MasteryTreeResponseSchema = z.array(z.object({
    name: z.string(),
    path: z.string(),
    score: z.number(),
    level: z.number(),
    children: z.array(z.any()) // Use any for children to avoid recursive schema issues in simple setup
}))

const HierarchyStatsSchema = z.object({
    avgScore: z.number(),
    count: z.number()
})

// --- Routes ---

// GET /api/v1/mastery/tree
const getTreeRoute = createRoute({
    method: 'get',
    path: '/tree',
    middleware: [authMiddleware] as const,
    responses: {
        200: {
            description: 'Get user mastery tree',
            content: {
                'application/json': {
                    schema: MasteryTreeResponseSchema
                }
            }
        }
    }
})

app.openapi(getTreeRoute, async (c) => {
    const user = getCurrentUser(c)
    const tree = await masteryService.getMasteryTree(Number(user.id))
    return c.json(tree)
})

// GET /api/v1/mastery/stats?tag=failed
const getStatsRoute = createRoute({
    method: 'get',
    path: '/stats',
    middleware: [authMiddleware] as const,
    request: {
        query: z.object({
            tag: z.string()
        })
    },
    responses: {
        200: {
            description: 'Get statistics for a specific tag hierarchy',
            content: {
                'application/json': {
                    schema: HierarchyStatsSchema
                }
            }
        }
    }
})

app.openapi(getStatsRoute, async (c) => {
    const user = getCurrentUser(c)
    const { tag } = c.req.valid('query')

    const stats = await masteryService.getHierarchyMastery(Number(user.id), tag)
    return c.json(stats)
})

export default app
