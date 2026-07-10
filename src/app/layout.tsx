import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

export const metadata: Metadata = {
  title: 'Aureus — Private wealth, struck as one',
  description: 'Investments, cash and spending — unified in one calm, tax-aware console.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="bottom-center" theme="system" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
