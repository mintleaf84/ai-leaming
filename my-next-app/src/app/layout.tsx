import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import _dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";
// import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { ThemeProvider } from "@/components/theme-provider";
import { TerminologyProvider } from "@/lib/hooks/use-terminology";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";
import { getGlobalFeatureFlag } from "@/server/actions/feature-flags";

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
    statusBarStyle: "black-translucent",
    title: "琢玉",
  },
  icons: {
    apple: "/icons/icon-192x192.png",
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

import { Suspense } from "react";
import { SidebarUser } from "@/components/layout/SidebarUser";
import { SidebarUserSkeleton } from "@/components/layout/SidebarUserSkeleton";
import { initDatabase as _initDatabase } from "@/lib/db";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize database is now handled by src/instrumentation.ts
  // initDatabase();

  const isTextbookEnabled = await getGlobalFeatureFlag("ENABLE_TEXTBOOK", true);
  const isNotesEnabled = await getGlobalFeatureFlag("ENABLE_NOTES", true);
  const isOcrMindmapEnabled = await getGlobalFeatureFlag(
    "ENABLE_OCR_MINDMAP",
    true,
  );
  const featureFlags = {
    ENABLE_TEXTBOOK: isTextbookEnabled,
    ENABLE_NOTES: isNotesEnabled,
    ENABLE_OCR_MINDMAP: isOcrMindmapEnabled,
  };

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
              themes={["light", "dark", "eye-care", "zhuoyu"]}
            >
              <div className="flex h-dvh">
                <div className="hidden md:flex">
                  <AppSidebar
                    userSection={
                      <Suspense fallback={<SidebarUserSkeleton />}>
                        <SidebarUser />
                      </Suspense>
                    }
                    featureFlags={featureFlags}
                  />
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                  <main className="flex-1 pb-20 md:pb-0 relative overflow-y-auto">
                    <ErrorBoundary>{children}</ErrorBoundary>
                  </main>
                </div>
              </div>
              <MobileNav featureFlags={featureFlags} />
              <Toaster position="top-center" richColors />
            </ThemeProvider>
          </TerminologyProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
