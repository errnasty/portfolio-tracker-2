'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fitWithinEdge } from '@/lib/image'
import type { TxnDraft } from '@/lib/extract'
import { Button } from '@/components/ui/button'
import { Camera, Loader2 } from 'lucide-react'

const MAX_EDGE = 1280
const JPEG_QUALITY = 0.8

// Downscales an image file to at most 1280px on the long edge, JPEG q0.8,
// and returns it as a data URL — keeps the request small and fast without a
// separate upload step (nothing is ever written to storage).
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = fitWithinEdge(bitmap.width, bitmap.height, MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    bitmap.close()
  }
}

interface Props {
  onExtracted: (draft: TxnDraft) => void
  disabled?: boolean
}

// A camera/file button that compresses the photo client-side, sends it to
// /api/extract-image (AI vision), and hands the resulting draft back to the
// caller — same TxnDraft shape as paste-to-parse, so both feed the same
// confirm-and-save form.
export function ReceiptCapture({ onExtracted, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setScanning(true)
    try {
      const image = await compressImage(file)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/extract-image', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ image }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? 'Could not read that photo — enter it manually instead.')
        return
      }
      onExtracted(data.draft as TxnDraft)
    } catch (err) {
      toast.error(`Scan failed: ${String((err as Error).message ?? err)}`)
    } finally {
      setScanning(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button
        type="button" variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || scanning}
      >
        {scanning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading photo…</> : <><Camera className="mr-2 h-4 w-4" /> Scan a receipt</>}
      </Button>
    </>
  )
}
