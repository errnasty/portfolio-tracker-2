import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Capture the Google refresh token the moment an OAuth session appears. This
// listener is registered at module load (before any page renders), so it fires
// even when the OAuth redirect lands on a page without the Gmail card. The
// token is stashed in localStorage; GmailCard persists it to the DB on mount.
export const PENDING_GOOGLE_TOKEN_KEY = 'pending_google_refresh_token'
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((_event, session) => {
    const rt = session?.provider_refresh_token
    if (rt) {
      try { window.localStorage.setItem(PENDING_GOOGLE_TOKEN_KEY, rt) } catch { /* ignore */ }
    }
  })
}
