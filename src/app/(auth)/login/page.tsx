'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email to confirm your account, then sign in.')
        setIsSignUp(false)
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* LEFT · brand panel */}
      <div className="relative hidden flex-1 overflow-hidden border-r border-border md:flex md:flex-col md:justify-between md:p-11">
        <Image
          src="/aureus/roman-1.png"
          alt=""
          fill
          className="object-cover opacity-[0.12]"
          style={{ filter: 'grayscale(1) contrast(0.96) brightness(1.3)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background/85" />

        <div className="relative z-10 flex items-center gap-3">
          <Image src="/aureus/face-ink.png" alt="Aureus" width={32} height={32} />
          <span className="font-display text-[22px] text-foreground">Aureus</span>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="relative mb-6 flex items-center justify-center">
            <div className="absolute h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,rgba(198,169,106,0.26),transparent_62%)]" />
            <Image src="/aureus/face-ink.png" alt="Aureus" width={220} height={220} className="relative drop-shadow-2xl" />
          </div>
          <h2 className="font-display text-[32px] font-normal leading-tight text-foreground">
            Private wealth, <em className="text-[#93702C] not-italic">struck as one.</em>
          </h2>
          <p className="mt-3.5 max-w-[340px] text-[15px] text-muted-foreground">
            Investments, cash and spending — unified in one calm, tax-aware console.
          </p>
        </div>

        <div className="relative z-10 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
          Est · MMXXVI — Made in Singapore
        </div>
      </div>

      {/* RIGHT · form */}
      <div className="flex w-full flex-col justify-center bg-secondary px-6 py-12 sm:px-10 md:w-[520px] md:border-l md:border-border animate-fade-in md:py-14">
        <div className="mx-auto w-full max-w-[400px]">
          {/* Segmented toggle */}
          <div className="mb-8 flex gap-1 rounded-[11px] border border-border bg-[var(--hair)] p-[3px]">
            <button
              onClick={() => { setIsSignUp(true); setError(''); setMessage('') }}
              className={cn(
                'flex-1 rounded-[8px] py-2 text-[13.5px] font-semibold transition-all',
                isSignUp ? 'bg-card text-foreground shadow-sm' : 'text-faint',
              )}
            >
              Create account
            </button>
            <button
              onClick={() => { setIsSignUp(false); setError(''); setMessage('') }}
              className={cn(
                'flex-1 rounded-[8px] py-2 text-[13.5px] font-semibold transition-all',
                !isSignUp ? 'bg-card text-foreground shadow-sm' : 'text-faint',
              )}
            >
              Sign in
            </button>
          </div>

          <h1 className="font-display text-[26px] md:text-[32px] font-medium leading-tight text-foreground">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2.5 text-[14.5px] text-muted-foreground">
            {isSignUp ? 'Start tracking your whole financial life.' : 'Sign in to your console.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            {isSignUp && (
              <div>
                <Label className="mb-1.5 block text-[12px] text-muted-foreground">Full name</Label>
                <Input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label className="mb-1.5 block text-[12px] text-muted-foreground">Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px] text-muted-foreground">Password</Label>
              <Input
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && <p className="text-sm text-down">{error}</p>}
            {message && <p className="text-sm text-up">{message}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Please wait…' : isSignUp ? 'Create account →' : 'Sign in →'}
            </Button>
          </form>

          <p className="mt-6 text-[12px] leading-relaxed text-faint">
            By continuing you agree to Aureus&apos;s{' '}
            <a href="#" className="text-muted-foreground underline">Terms</a> and{' '}
            <a href="#" className="text-muted-foreground underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
