import { NextRequest, NextResponse } from 'next/server'

// Lightweight telemetry sink. Receives client-side error reports from the
// error boundary and writes them to the server console. If SENTRY_DSN is set
// the same payload is forwarded to Sentry — but we don't depend on the
// @sentry/nextjs SDK so the dev environment stays light. Drop in the SDK
// later if you want stack-trace symbolication and the full Sentry UX.

interface ClientError {
  message: string
  stack?: string
  digest?: string
  url?: string
  userAgent?: string
  componentStack?: string
}

export async function POST(req: NextRequest) {
  let body: ClientError
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Always log server-side
  console.error('[client-error]', {
    message: body.message,
    digest: body.digest,
    url: body.url,
    stack: body.stack?.split('\n').slice(0, 5).join('\n'),
  })

  // Forward to Sentry if configured. We use the bare HTTP envelope endpoint
  // so we don't pull in the SDK. If the DSN is missing or malformed we just
  // skip silently.
  const dsn = process.env.SENTRY_DSN
  if (dsn) {
    try {
      await sendToSentry(dsn, body, req)
    } catch (err) {
      console.error('[client-error] sentry forward failed:', String(err))
    }
  }

  return NextResponse.json({ ok: true })
}

async function sendToSentry(dsn: string, err: ClientError, req: NextRequest) {
  // Sentry DSN format: https://<key>@<host>/<projectId>
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/)
  if (!match) return
  const [, key, host, projectId] = match

  const eventId = crypto.randomUUID().replace(/-/g, '')
  const sentAt = new Date().toISOString()

  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'javascript',
    level: 'error',
    logger: 'portfolio-tracker',
    server_name: 'web',
    request: {
      url: err.url,
      headers: { 'User-Agent': err.userAgent ?? req.headers.get('user-agent') ?? '' },
    },
    exception: {
      values: [{
        type: 'Error',
        value: err.message,
        stacktrace: err.stack ? { frames: parseStack(err.stack) } : undefined,
      }],
    },
    extra: {
      digest: err.digest,
      componentStack: err.componentStack,
    },
  }

  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n')

  await fetch(`https://${host}/api/${projectId}/envelope/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=portfolio-tracker/1.0`,
    },
    body: envelope,
  })
}

function parseStack(stack: string): { filename?: string; function?: string; lineno?: number; colno?: number }[] {
  return stack.split('\n').slice(0, 50).map((line) => {
    const m = line.match(/at\s+(.+?)\s+\(?(.*?):(\d+):(\d+)\)?/)
    if (!m) return { function: line.trim() }
    return { function: m[1], filename: m[2], lineno: parseInt(m[3], 10), colno: parseInt(m[4], 10) }
  })
}
