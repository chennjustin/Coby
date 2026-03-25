interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * 輕量級 in-memory TTL cache。
 * 適用於 serverless（每個 cold start 自動清空）。
 */
export class TtlCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxSize: number;

  constructor(defaultTtlMs = 60_000, maxSize = 500) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.maxSize) {
      this.evictExpired();
      if (this.store.size >= this.maxSize) {
        const oldest = this.store.keys().next().value;
        if (oldest !== undefined) this.store.delete(oldest);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now > v.expiresAt) this.store.delete(k);
    }
  }
}

/** 產生穩定的 cache key（userId + query 組合） */
export function makeCacheKey(...parts: string[]): string {
  return parts.join("::");
}
