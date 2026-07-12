'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSpending } from '@/context/SpendingContext'
import { getInboundAddress, provisionInboundAddress, INBOUND_DOMAIN } from '@/lib/inbound'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, Copy, RefreshCw, CheckCircle2, Loader2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import type { InboundAddress } from '@/types'

export function ForwardAddressCard() {
  const { refreshBankTransactions } = useSpending()
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [showInstructions, setShowInstructions] = useState(false)
  const [missingTable, setMissingTable] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !active) return

      // Try client-side first (uses anon key + RLS).
      let addr: InboundAddress | null = null
      try {
        addr = await getInboundAddress(session.user.id)
        if (!addr) {
          addr = await provisionInboundAddress(session.user.id, session.user.email ?? undefined)
        }
      } catch (clientErr) {
        // If the table is missing, the client-side approach fails with
        // a "Could not find the table" schema-cache error. Fall back to
        // the server-side provisioning endpoint which uses the service
        // role key (bypasses RLS) and gives a clearer error.
        const msg = String(clientErr)
        if (/could not find the table|schema cache|relation .* does not exist/i.test(msg)) {
          setMissingTable(true)
          // Attempt server-side provisioning as a fallback.
          try {
            const resp = await fetch('/api/inbound/provision', {
              headers: { authorization: `Bearer ${session.access_token}` },
            })
            if (resp.ok) {
              addr = await resp.json() as InboundAddress
              setMissingTable(false)
            } else {
              const body = await resp.json().catch(() => ({ error: resp.statusText }))
              throw new Error(body.error ?? `Server returned ${resp.status}`)
            }
          } catch (serverErr) {
            // Both paths failed — show the migration banner.
            if (active) {
              toast.error(`Failed to set up forwarding address: ${String(serverErr)}`)
            }
            return
          }
        } else {
          if (active) toast.error(`Failed to set up forwarding address: ${msg}`)
          return
        }
      }

      if (active && addr) {
        setAddress(addr.address)
        setLastSynced(addr.last_synced)
      }
    })().finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const copyAddress = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Address copied to clipboard')
    } catch {
      toast.error('Could not copy — select and copy manually')
    }
  }

  const sync = async () => {
    setSyncing(true)
    try {
      await refreshBankTransactions()
      setLastSynced(new Date().toISOString())
      toast.success('Transactions refreshed')
    } catch (e) {
      toast.error(`Refresh failed: ${String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <Card className="max-w-md">
        <CardContent className="flex items-center gap-2 py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Setting up your address…</span>
        </CardContent>
      </Card>
    )
  }

  // If the table is missing and server-side provisioning also failed,
  // show a migration banner with instructions instead of a broken card.
  if (missingTable && !address) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warn" /> Bank email forwarding
          </CardTitle>
          <CardDescription>
            The <code className="text-xs font-mono">inbound_addresses</code> table hasn&apos;t been
            created in your Supabase database yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Run the migration SQL in your Supabase SQL Editor:
          </p>
          <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">{`-- Supabase → SQL Editor → New Query
-- Run supabase/migrations/001_inbound_addresses.sql
-- (found in your project repo)`}</pre>
          <p className="text-xs text-muted-foreground">
            After running the migration, refresh this page.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Bank email forwarding
        </CardTitle>
        <CardDescription>
          Forward your bank notification emails to your unique address below.
          We&apos;ll automatically parse the amount, merchant, and category.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Address display + copy */}
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono">{address}</code>
          <Button size="icon" variant="outline" onClick={copyAddress} title="Copy address">
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        {/* Status */}
        {lastSynced && (
          <div className="flex items-center gap-1.5 text-sm text-up">
            <CheckCircle2 className="h-4 w-4" /> Last synced {new Date(lastSynced).toLocaleString()}
          </div>
        )}

        {/* Instructions toggle */}
        <button
          onClick={() => setShowInstructions((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          How to set up forwarding
          {showInstructions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showInstructions && (
          <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>Log in to your bank&apos;s app or website (DBS/POSB, OCBC, etc.)</li>
            <li>Find the notification/email alerts settings</li>
            <li>Add <code className="font-mono text-foreground">{address}</code> as a recipient for transaction alerts</li>
            <li>New transactions will appear here automatically within seconds of the email arriving</li>
            <li>You can also manually forward any bank email to this address</li>
          </ol>
        )}

        {/* Refresh button */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
            {syncing
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing…</>
              : <><RefreshCw className="mr-2 h-4 w-4" /> Refresh</>}
          </Button>
          <span className="text-xs text-muted-foreground">
            Forwarded emails are processed automatically — use Refresh to check for new transactions.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
