import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt, COOKIE_NAME } from '@/lib/auth/auth-edge';

// 1. Specify protected and public routes
const protectedRoutes = ['/practice', '/dashboard', '/chat', '/history', '/knowledge', '/settings', '/admin'];
const publicRoutes = ['/login', '/register'];

export async function middleware(req: NextRequest) {
    // 0. Generate Request ID for tracing
    const requestId = crypto.randomUUID(); // Use native crypto, faster than nanoid for simple UUIDs
    const startTime = Date.now();

    // 2. Check if the current route is protected or public
    const path = req.nextUrl.pathname;
    const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route));
    const isPublicRoute = publicRoutes.includes(path);

    // 3. Decrypt the session from the cookie
    const cookie = req.cookies.get(COOKIE_NAME)?.value;
    let session = null;
    let userId = 'anonymous';

    if (cookie) {
        try {
            session = await decrypt(cookie);
            userId = session?.user?.id ? String(session.user.id) : 'anonymous';
            console.log(`[Middleware] Token valid for user: ${userId}`);
        } catch (e: unknown) {
            console.warn(`[Middleware] Token decryption failed: ${e.message}`);
        }
    } else {
        console.log(`[Middleware] No auth cookie found for path: ${path}`);
    }

    // 4. Redirect to /login if the user is not authenticated
    if (isProtectedRoute && !session) {
        return NextResponse.redirect(new URL('/login', req.nextUrl));
    }

    // 4.1 Admin Route Protection (基于角色的权限控制)
    if (path.startsWith('/admin')) {
        // 使用角色字段判断权限，而非硬编码 ID
        if (!session?.user?.role || session.user.role !== 'admin') {
            return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
        }
    }

    // 5. Redirect to /dashboard if the user is authenticated and trying to access a public route
    // (Optional: usually helpful for login/register pages)
    if (
        isPublicRoute &&
        session &&
        !req.nextUrl.pathname.startsWith('/dashboard') &&
        path !== '/'
    ) {
        return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }

    const response = NextResponse.next();

    // 6. Injection Tracing Headers
    response.headers.set('X-Request-Id', requestId);

    // 7. Structural Logging (Async not to block)
    // Note: In Vercel/Edge, console.log is the way to pipe logs. 
    // We use a simplified JSON via console.log directly to reduce dependency overhead in middleware if possible, 
    // but here we used `logger` if it's edge compatible or just simple console.log for middleware specifically.
    // Given middleware runs on Edge, `pino` might be heavy. Let's use robust console.log JSON for middleware.
    const duration = Date.now() - startTime;
    console.log(JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        requestId,
        method: req.method,
        path,
        status: response.status,
        duration: `${duration}ms`,
        userId,
        ip: req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || 'unknown'
    }));

    return response;
}

// Routes Middleware should not run on
export const config = {
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
