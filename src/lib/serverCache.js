/**
 * Lightweight Server-Side In-Memory TTL Cache with Prefix Invalidation.
 * Eliminates repeated Supabase round-trips across dashboard, stock, production,
 * dispatch, planning, models, and reports API routes.
 */

const cacheStore = new Map();
const MAX_CACHE_ENTRIES = 250;

export function getCached(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(key, data, ttlMs = 15000) {
  if (cacheStore.size >= MAX_CACHE_ENTRIES) {
    // Evict expired first; if still full, reset store
    const now = Date.now();
    for (const [k, v] of cacheStore.entries()) {
      if (v.expiresAt <= now) cacheStore.delete(k);
    }
    if (cacheStore.size >= MAX_CACHE_ENTRIES) {
      cacheStore.clear();
    }
  }
  cacheStore.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateCache(...prefixes) {
  if (!prefixes || prefixes.length === 0) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (prefixes.some((p) => key.startsWith(p))) {
      cacheStore.delete(key);
    }
  }
}
