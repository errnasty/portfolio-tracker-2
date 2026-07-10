import { supabase } from './supabase'
import type { InboundAddress } from '@/types'

// The domain that receives forwarded bank emails. Configure in env.
export const INBOUND_DOMAIN =
  process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? 'inbound.aureus.app'

// Generate a random 10-char alphanumeric local part.
function randomLocal(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// Get the user's existing inbound address, or null if not provisioned.
export async function getInboundAddress(userId: string): Promise<InboundAddress | null> {
  const { data } = await supabase
    .from('inbound_addresses')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data as InboundAddress | null
}

// Provision a new inbound address for the user. Returns the full record.
// If one already exists, returns the existing one. Uses upsert with
// onConflict so two concurrent provisioning attempts can't fail the second.
export async function provisionInboundAddress(userId: string, email: string | undefined): Promise<InboundAddress> {
  const existing = await getInboundAddress(userId)
  if (existing) return existing

  const addressLocal = randomLocal()
  const address = `${addressLocal}@${INBOUND_DOMAIN}`

  const { data, error } = await supabase
    .from('inbound_addresses')
    .upsert(
      {
        user_id: userId,
        address,
        address_local: addressLocal,
        last_synced: null,
        total_synced: 0,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single()

  if (error) throw new Error(`Failed to provision address: ${error.message}`)
  return data as InboundAddress
}
