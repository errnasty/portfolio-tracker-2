import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { ServiceWorkerRegistrar } from '@/components/layout/ServiceWorkerRegistrar'
import { ThemeColorSync } from '@/components/layout/ThemeColorSync'

export const metadata: Metadata = {
  title: 'Aureus — Private wealth, struck as one',
  description: 'Investments, cash and spending — unified in one calm, tax-aware console.',
  manifest: '/manifest.webmanifest',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f0f' },
  ],
  viewport: { width: 'device-width', initialScale: 1, viewportFit: 'cover' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Aureus' },
  icons: { apple: '/apple-touch-icon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <ThemeColorSync />
          {children}
          <Toaster position="bottom-center" theme="system" richColors closeButton />
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  )
}
