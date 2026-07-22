'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'

// The browser chrome / mobile status-bar tint comes from <meta name="theme-color">.
// The static tags in metadata only switch on the *system* color scheme, so a
// user who manually flips the in-app theme (overriding system) would get a
// mismatched bar. This keeps the tag in lock-step with the theme actually
// applied, using the real top-surface color (bg-card) the mobile header sits on.
const CARD_LIGHT = '#ffffff'
const CARD_DARK = '#0f0f0f'

export function ThemeColorSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const color = resolvedTheme === 'dark' ? CARD_DARK : CARD_LIGHT
    // Replace any media-scoped tags with a single active one so it wins
    // regardless of system preference.
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((el) => el.parentElement?.removeChild(el))
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = color
    document.head.appendChild(meta)
  }, [resolvedTheme])

  return null
}
