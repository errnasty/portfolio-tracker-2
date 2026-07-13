import type { MetadataRoute } from 'next'

// Web app manifest — makes Aureus installable as a home-screen app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aureus — Private wealth',
    short_name: 'Aureus',
    description: 'Investments, cash and spending — unified in one calm console.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#1a1a18',
    theme_color: '#1a1a18',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
