// src/services/serviceCache.ts

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;     // Changed from timestamp to explicit expiration
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  size: number;
  totalAccesses: number;
  avgAccessCount: number;
  hits: number;
  misses: number;
  hitRate: number;       // Percentage (0-100)
}

export interface CacheConfig {
  defaultTtlMs: number;
  maxEntries: number;
  cleanupIntervalMs: number;
}

export class ServiceCache {
  // Use <any> internally, but expose strict generics on the public API
  private static cache = new Map<string, CacheEntry<any>>();
  
  private static config: CacheConfig = {
    defaultTtlMs: 5 * 60 * 1000, // 5 minutes
    maxEntries: 1000,
    cleanupIntervalMs: 60 * 1000 // 1 minute
  };

  // Telemetry
  private static hits = 0;
  private static misses = 0;
  private static cleanupTimer: ReturnType<typeof setInterval> | null = null;

  static {
    this.startCleanupTimer();
  }

  /**
   * Starts the periodic garbage collection timer.
   */
  private static startCleanupTimer(): void {
    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);

      // Unref the timer under Node so it does not hold the event loop open.
      // `setInterval` is typed as returning `number` in a DOM lib build, so the
      // Node-only `unref` is reached through a narrow structural cast rather
      // than by pulling @types/node into a browser bundle.
      const timer = this.cleanupTimer as unknown as { unref?: () => void };
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    }
  }

  /**
   * Safely stops the cleanup timer. Crucial for avoiding memory leaks during testing/HMR.
   */
  static dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  /**
   * Stores a value in the cache with an optional TTL.
   */
  static set<T>(key: string, data: T, ttlMs: number = this.config.defaultTtlMs): void {
    // Proactive eviction if capacity is reached
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs, // Fixed: Store explicit expiration
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  /**
   * Retrieves a value from the cache. Returns null if missing or expired.
   */
  static get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check strict expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.data as T;
  }

  /**
   * Checks if a valid, unexpired key exists in the cache.
   */
  static has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Deletes a specific key from the cache.
   */
  static delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clears the entire cache and resets telemetry.
   */
  static clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Replaces the default configuration.
   */
  static configure(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart timer if interval changed
    if (newConfig.cleanupIntervalMs) {
      if (this.cleanupTimer) clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.startCleanupTimer();
    }
  }

  /**
   * Periodic garbage collection of expired keys.
   */
  private static cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evicts the least valuable entry based on frequency and recency.
   */
  private static evictLeastUsed(): void {
    let targetKey: string | null = null;
    let lowestScore = Infinity;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      // Clean up expired items gracefully during the iteration
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        continue;
      }

      // Hybrid LFU/LRU Score: (Accesses) / (Age in ms)
      // Adds 1000ms base age to prevent division by zero or extreme skew for brand new items
      const ageMs = now - entry.lastAccessed + 1000; 
      const score = entry.accessCount / ageMs;

      if (score < lowestScore) {
        lowestScore = score;
        targetKey = key;
      }
    }
    
    if (targetKey !== null) {
      this.cache.delete(targetKey);
    }
  }

  /**
   * Returns deep analytics about cache performance.
   */
  static getStats(): CacheStats {
    let totalAccesses = 0;
    
    for (const entry of this.cache.values()) {
      totalAccesses += entry.accessCount;
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    return {
      size: this.cache.size,
      totalAccesses,
      avgAccessCount: this.cache.size > 0 ? totalAccesses / this.cache.size : 0,
      hits: this.hits,
      misses: this.misses,
      hitRate: parseFloat(hitRate.toFixed(2))
    };
  }
}