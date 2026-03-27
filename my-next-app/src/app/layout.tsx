import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import dynamic from 'next/dynamic';
import { ErrorBoundary } from "@/components/ErrorBoundary";
// import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { ThemeProvider } from "@/components/theme-provider";
import { TerminologyProvider } from "@/lib/hooks/use-terminology";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";

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

import { Suspense } from 'react';
import { SidebarUser } from "@/components/layout/SidebarUser";
import { SidebarUserSkeleton } from "@/components/layout/SidebarUserSkeleton";
import { initDatabase } from "@/lib/init-db";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize database once on server start (or per request, but initDatabase handles idempotency)
  initDatabase();

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <QueryProvider>
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
                <AppSidebar 
                  userSection={
                    <Suspense fallback={<SidebarUserSkeleton />}>
                      <SidebarUser />
                    </Suspense>
                  } 
                />
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
            <MobileNav />
            <Toaster position="top-center" richColors />
          </ThemeProvider>
        </TerminologyProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
