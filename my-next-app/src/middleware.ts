import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt, COOKIE_NAME } from '@/lib/auth/auth';

// 1. Specify protected and public routes
const protectedRoutes = ['/practice', '/dashboard', '/chat', '/history', '/knowledge', '/settings', '/admin'];
const publicRoutes = ['/login', '/register'];

export async function middleware(req: NextRequest) {
    // 2. Check if the current route is protected or public
    const path = req.nextUrl.pathname;
    const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route)) || path === '/';
    const isPublicRoute = publicRoutes.includes(path);

    // 3. Decrypt the session from the cookie
    const cookie = req.cookies.get(COOKIE_NAME)?.value;
    let session = null;
    if (cookie) {
        try {
            session = await decrypt(cookie);
        } catch (e) {
            // Token invalid or expired
        }
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

    return NextResponse.next();
}

// Routes Middleware should not run on
export const config = {
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
