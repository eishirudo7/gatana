import '@/app/globals.css'
import { Inter } from 'next/font/google'
import { Header } from "@/components/layout/Header"
import {Sidebar} from "@/components/layout/Sidebar"
import dynamic from 'next/dynamic'
import { Toaster } from 'sonner';
import Providers from "./services/Providers"
import { SSEProvider } from './services/SSEService';
import { GlobalNotification } from '@/components/GlobalNotification';

import type { Viewport } from 'next'


const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Dashboard',
  description: 'Yorozuya Management System',
  icons: {
    icon: [
      { url: '/favicon-16x16.png?v=1', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png?v=1', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png?v=1', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png?v=1', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png?v=1', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
}

interface RootLayoutProps {
  children: React.ReactNode
}

const ThemeProvider = dynamic(() => import('@/components/layout/theme-provider').then(mod => mod.ThemeProvider), {
  ssr: false
})

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body className={`h-full ${inter.className} flex flex-col overflow-hidden`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SSEProvider>
            <Providers>
              <GlobalNotification />
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <div className="flex flex-col flex-1 overflow-hidden md:pl-[56px]">
                  <Header />
                  <main className="flex-1 overflow-auto">
                    <Providers>{children}</Providers>
                  </main>
                </div>
              </div>
            </Providers>
          </SSEProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  )
}
