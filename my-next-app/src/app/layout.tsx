import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Navbar } from "@/components/Navbar";
import { MobileNav } from "@/components/MobileNav";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ... existing imports

export const metadata: Metadata = {
  title: "AI 教招客观题智能提升系统",
  description: "基于 RAG 与变式生成技术的智能化练习平台",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AI 教招",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#3b82f6",
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          themes={['light', 'dark', 'eye-care']}
        >
          <Navbar user={user as any} />
          <main className="pb-16 md:pb-0">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
          <MobileNav user={user as any} />
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
