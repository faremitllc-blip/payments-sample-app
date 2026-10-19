/**
 * A tiny in-memory cache with an expiry time. Each server instance has its own,
 * so it only saves repeat lookups within a short window. It never replaces the
 * database or the payment providers as the source of truth.
 */

interface Entry {
  value: unknown
  expires: number
}

const store = new Map<string, Entry>()
const MAX_ENTRIES = 500

export function memoGet<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) {
    return undefined
  }
  if (entry.expires <= Date.now()) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

export function memoSet(key: string, value: unknown, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, e] of store) {
      if (e.expires <= now) {
        store.delete(k)
      }
    }
    if (store.size >= MAX_ENTRIES) {
      store.clear()
    }
  }
  store.set(key, { value, expires: Date.now() + ttlMs })
}

export function memoDelete(key: string): void {
  store.delete(key)
}
