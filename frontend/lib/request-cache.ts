"use client"

type CacheRecord<T> = {
  data: T
  expiresAt: number
}

const responseCache = new Map<string, CacheRecord<unknown>>()
const inflightRequests = new Map<string, Promise<unknown>>()

export async function getCachedRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 15_000,
): Promise<T> {
  if (typeof window === "undefined") {
    return fetcher()
  }

  const now = Date.now()
  const cached = responseCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.data as T
  }

  const inflight = inflightRequests.get(key)
  if (inflight) {
    return inflight as Promise<T>
  }

  const request = fetcher()
    .then((data) => {
      responseCache.set(key, { data, expiresAt: Date.now() + ttlMs })
      inflightRequests.delete(key)
      return data
    })
    .catch((error) => {
      inflightRequests.delete(key)
      throw error
    })

  inflightRequests.set(key, request)
  return request
}

export function invalidateRequestCache(keys?: string | string[]) {
  const targets = Array.isArray(keys) ? keys : keys ? [keys] : []

  if (targets.length === 0) {
    responseCache.clear()
    inflightRequests.clear()
    return
  }

  for (const target of targets) {
    for (const key of responseCache.keys()) {
      if (key === target || key.startsWith(target)) {
        responseCache.delete(key)
      }
    }

    for (const key of inflightRequests.keys()) {
      if (key === target || key.startsWith(target)) {
        inflightRequests.delete(key)
      }
    }
  }
}

export function clearRequestCache() {
  responseCache.clear()
  inflightRequests.clear()
}
