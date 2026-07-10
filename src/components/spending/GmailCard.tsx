'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase, PENDING_GOOGLE_TOKEN_KEY } from '@/lib/supabase'
import { useSpending } from '@/context/SpendingContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react'

// Phase B: connect Gmail (read-only) and pull DBS/POSB transaction alerts into
// the spending ledger. Requires the Google provider enabled in Supabase Auth
// and GOOGLE_CLIENT_ID/SECRET on the server (see .env.local.example).
export function GmailCard() {
  const { refreshBankTransactions } = useSpending()
  const [connected, setConnected] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return

      // Persist a refresh token captured during the OAuth redirect (stashed by
      // the listener in lib/supabase). Runs wherever the redirect landed.
      let pending: string | null = null
      try { pending = window.localStorage.getItem(PENDING_GOOGLE_TOKEN_KEY) } catch { /* ignore */ }
      if (pending) {
        await supabase.from('google_tokens').upsert(
          { user_id: user.id, refresh_token: pending, email: user.email, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
        try { window.localStorage.removeItem(PENDING_GOOGLE_TOKEN_KEY) } catch { /* ignore */ }
        if (active) { setConnected(true); toast.success('Gmail connected') }
      }

      const { data } = await supabase
        .from('google_tokens').select('last_synced').eq('user_id', user.id).single()
      if (data && active) { setConnected(true); setLastSynced(data.last_synced) }
    })()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const refreshToken = session?.provider_refresh_token
      if (event === 'SIGNED_IN' && refreshToken) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase.from('google_tokens').upsert(
          { user_id: user.id, refresh_token: refreshToken, email: user.email, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
        setConnected(true)
        toast.success('Gmail connected')
      }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const connect = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    })
  }

  const sync = async () => {
    setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Not signed in'); return }
      const res = await fetch('/api/bank/gmail-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Sync failed'); return }
      toast.success(`Synced — ${json.inserted} new of ${json.scanned} scanned`)
      setLastSynced(new Date().toISOString())
      await refreshBankTransactions()
    } catch (e) {
      toast.error(`Sync failed: ${String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Bank email sync (POSB)
        </CardTitle>
        <CardDescription>
          Connect Gmail (read-only) to auto-import DBS/POSB transaction alerts as spending.
          {connected && lastSynced && (
            <> Last synced {new Date(lastSynced).toLocaleString()}.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        {connected ? (
          <>
            <span className="flex items-center gap-1.5 text-sm text-up">
              <CheckCircle2 className="h-4 w-4" /> Connected
            </span>
            <Button size="sm" onClick={sync} disabled={syncing} className="ml-auto">
              {syncing
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing…</>
                : <><RefreshCw className="mr-2 h-4 w-4" /> Sync now</>}
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={connect}>
            <Mail className="mr-2 h-4 w-4" /> Connect Gmail
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
