import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        // Aureus semantic tokens — HSL so Tailwind opacity modifiers work
        up: 'hsl(var(--up-hsl))',
        'up-soft': 'var(--up-soft)',
        down: 'hsl(var(--down-hsl))',
        cool: 'hsl(var(--cool-hsl))',
        warn: 'hsl(var(--warn-hsl))',
        faint: 'var(--faint)',
        // ── Console→Aureus legacy aliases ───────────────────────────────
        // These map the project's old hardcoded palette onto the Aureus
        // tokens so existing component classes keep working after the redesign.
        'emerald-400': 'hsl(var(--up-hsl))',
        'emerald-500': 'hsl(var(--up-hsl))',
        'emerald-300': 'hsl(var(--up-hsl))',
        'red-400': 'hsl(var(--down-hsl))',
        'red-500': 'hsl(var(--down-hsl))',
        'red-300': 'hsl(var(--down-hsl))',
        'amber-400': 'hsl(var(--warn-hsl))',
        'amber-500': 'hsl(var(--warn-hsl))',
        'sky-400': 'hsl(var(--cool-hsl))',
        'sky-500': 'hsl(var(--cool-hsl))',
      },
      fontFamily: {
        sans: ['Hanken Grotesk', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Newsreader', 'Spectral', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
    },
  },
  plugins: [],
}
export default config
