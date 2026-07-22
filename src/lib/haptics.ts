'use client'

// Tiny haptic feedback helper. Uses the Vibration API where available
// (Android Chrome, some others). iOS Safari ignores navigator.vibrate, so this
// is a progressive enhancement — never rely on it for essential feedback.
// Respects the user's reduced-motion preference: no buzzing if they've asked
// the system to calm down.

type HapticKind = 'light' | 'medium' | 'success' | 'warning'

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 14,
  success: [10, 40, 10],
  warning: [16, 60, 16],
}

export function haptic(kind: HapticKind = 'light'): void {
  if (typeof window === 'undefined') return
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate(PATTERNS[kind])
  } catch {
    /* ignore — vibration is best-effort */
  }
}
