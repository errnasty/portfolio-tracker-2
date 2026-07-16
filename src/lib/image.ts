// Pure sizing math for client-side receipt-photo downscaling (the actual
// canvas draw/encode happens in the browser — see ReceiptCapture.tsx — but
// the dimension calculation is kept here so it's unit-testable).

// Scales width/height down so the longer edge is at most maxEdge, preserving
// aspect ratio. Never scales up (a small image stays as-is).
export function fitWithinEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest <= 0) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
