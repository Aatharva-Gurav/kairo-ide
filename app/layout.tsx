import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ErrorBoundaryGuard } from "@/components/error-boundary-guard";
import { AuthProvider } from "@/features/auth/store";
import { WorkspaceProvider } from "@/features/workspace/store";
import { SettingsProvider } from "@/features/settings/store";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kairo IDE",
  description: "Modern desktop IDE built with Next.js and Tauri",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className="h-full w-full overflow-hidden flex flex-col bg-background text-foreground">
        <ErrorBoundaryGuard>
          <AuthProvider>
            <WorkspaceProvider>
              <SettingsProvider>{children}</SettingsProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </ErrorBoundaryGuard>
      </body>
    </html>
  );
}

