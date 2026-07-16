// Normalizes the many shapes an inbound-email webhook can POST into one
// consistent record. Providers disagree wildly:
//   - CloudMailin multipart: envelope[to], envelope[from], headers[Subject],
//     plain, html
//   - CloudMailin JSON:      { envelope: {to, from}, headers: {Subject}, plain, html }
//   - Postmark JSON:         { To, From, Subject, TextBody, HtmlBody, OriginalRecipient }
//   - Generic/SendGrid:      { to, from, subject, text, html }
//   - Raw RFC 822:           header lines + blank line + body
//
// The critical field is the RECIPIENT: which of our users this mail is for.
// Gmail auto-forwarding preserves the *original* To: header (the user's own
// gmail), so the reliable recipient is the delivery envelope, not To:. We
// therefore return an ordered list of candidate recipients, most-reliable
// first, and let the caller resolve each against inbound_addresses.

export interface NormalizedEmail {
  recipients: string[]   // ordered by reliability; already lowercased bare addresses
  from: string
  subject: string
  text: string
  html: string
}

// Pull the bare address out of "Name <addr@x>", "<addr@x>", or "addr@x".
export function extractEmailAddress(raw: string): string {
  if (!raw) return ''
  const angle = raw.match(/<([^>]+)>/)
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase()
  // A header value may still carry trailing junk; keep the token that looks
  // like an email.
  const m = candidate.match(/[^\s,;:<>"']+@[^\s,;:<>"']+/)
  return m ? m[0] : candidate
}

// A header/field can hold a comma-separated list ("a@x, b@y"); split it and
// extract each address, dropping blanks.
function addressList(raw: string | undefined | null): string[] {
  if (!raw) return []
  return String(raw)
    .split(',')
    .map((part) => extractEmailAddress(part))
    .filter(Boolean)
}

function extractHeader(raw: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
  const m = raw.match(re)
  return m ? m[1].trim() : ''
}

// Push candidates in order, de-duplicating while preserving first-seen order.
function orderedUnique(...groups: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const g of groups) {
    for (const addr of g) {
      if (addr && !seen.has(addr)) { seen.add(addr); out.push(addr) }
    }
  }
  return out
}

// Reads a possibly-nested field from a JSON body, tolerant of the different
// provider casings (e.g. envelope.to, To, to).
function pick(obj: any, ...paths: string[]): string {
  for (const path of paths) {
    let cur = obj
    for (const key of path.split('.')) {
      if (cur == null) { cur = undefined; break }
      cur = cur[key]
    }
    if (typeof cur === 'string' && cur.trim()) return cur
  }
  return ''
}

// contentType selects the parse strategy; body is FormData | parsed-JSON |
// raw string depending on the caller.
export function normalizeInboundEmail(
  contentType: string,
  body: FormData | Record<string, any> | string,
): NormalizedEmail {
  if (contentType.includes('multipart/form-data') && typeof (body as FormData).get === 'function') {
    const fd = body as FormData
    const g = (k: string) => (fd.get(k) as string) ?? ''
    const envTo = g('envelope[to]')
    const to = g('to')
    const subject = g('subject') || g('headers[Subject]')
    const text = g('plain') || g('text')
    const html = g('html')
    const from = g('envelope[from]') || g('from')
    return {
      recipients: orderedUnique(addressList(envTo), addressList(to)),
      from: extractEmailAddress(from),
      subject,
      text,
      html,
    }
  }

  if (typeof body === 'object' && body !== null && !(body instanceof String)) {
    const json = body as Record<string, any>
    const envelopeTo = pick(json, 'envelope.to', 'envelope.recipient')
    const originalRecipient = pick(json, 'OriginalRecipient', 'original_recipient')
    const to = pick(json, 'To', 'to')
    const from = pick(json, 'envelope.from', 'From', 'from')
    const subject = pick(json, 'Subject', 'subject', 'headers.Subject', 'headers.subject')
    const text = pick(json, 'plain', 'TextBody', 'text', 'body-plain')
    const html = pick(json, 'html', 'HtmlBody', 'body-html')
    return {
      recipients: orderedUnique(
        addressList(envelopeTo),
        addressList(originalRecipient),
        addressList(to),
      ),
      from: extractEmailAddress(from),
      subject,
      text,
      html,
    }
  }

  // Raw RFC 822.
  const raw = String(body)
  const deliveredTo = extractHeader(raw, 'Delivered-To')
  const xForwardedTo = extractHeader(raw, 'X-Forwarded-To')
  const to = extractHeader(raw, 'To')
  const from = extractHeader(raw, 'From')
  const subject = extractHeader(raw, 'Subject')
  const sep = raw.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n'
  const idx = raw.indexOf(sep)
  const text = idx >= 0 ? raw.slice(idx + sep.length) : ''
  return {
    recipients: orderedUnique(
      addressList(deliveredTo),
      addressList(xForwardedTo),
      addressList(to),
    ),
    from: extractEmailAddress(from),
    subject,
    text,
    html: '',
  }
}
