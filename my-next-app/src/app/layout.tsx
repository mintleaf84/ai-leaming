import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
// import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { ThemeProvider } from "@/components/theme-provider";
import { TerminologyProvider } from "@/lib/hooks/use-terminology";
import "./globals.css";

const geistSans = localFont({
  src: "../../public/fonts/GeistVF.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "../../public/fonts/GeistMonoVF.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// ... existing imports

export const metadata: Metadata = {
  title: "琢玉 - AI 驱动的教师招聘备考助手",
  description: "精琢每一分，只为成师。基于 RAG 与变式生成技术的智能化练习平台",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "琢玉",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

import { getSession } from "@/lib/auth/auth";
import { initDatabase } from "@/lib/init-db";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize database once on server start (or per request, but initDatabase handles idempotency)
  initDatabase();

  const session = await getSession();
  const user = session?.user ? { id: session.user.id, username: session.user.username, role: session.user.role } : null;

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <TerminologyProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            themes={['light', 'dark', 'eye-care', 'zhuoyu']}
          >
            <div className="flex h-screen">
              <div className="hidden md:flex">
                <AppSidebar user={user as any} />
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header Placeholder if needed, or rely on MobileNav bottom */}
                <main className="flex-1 pb-16 md:pb-0 relative overflow-y-auto">
                  <ErrorBoundary>
                    {children}
                  </ErrorBoundary>
                </main>
              </div>
            </div>
            <MobileNav user={user as any} />
            <Toaster position="top-center" richColors />
          </ThemeProvider>
        </TerminologyProvider>
      </body>
    </html>
  );
}
