export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).length
  const raw = Math.ceil(words / 200)
  return Math.ceil(raw / 5) * 5
}
