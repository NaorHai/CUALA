/**
 * DOM Structure Cache
 * LRU cache for storing extracted DOM structures to avoid redundant page evaluations
 */

import { ILogger } from './logger.js';

interface CacheEntry {
  structure: string;
  timestamp: number;
  size: number;
}

export interface DOMCacheOptions {
  maxSize: number;  // Maximum number of entries
  ttl: number;      // Time to live in milliseconds
  maxEntrySize?: number; // Maximum size of a single entry in bytes
}

/**
 * LRU Cache for DOM structures
 */
export class DOMCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];

  constructor(
    private options: DOMCacheOptions,
    private logger?: ILogger
  ) {
    this.logger?.debug('DOMCache initialized', {
      maxSize: options.maxSize,
      ttlSeconds: options.ttl / 1000,
      maxEntrySizeKB: options.maxEntrySize ? Math.round(options.maxEntrySize / 1024) : 'unlimited'
    });
  }

  /**
   * Set a DOM structure in cache
   */
  set(url: string, structure: string): void {
    // Check entry size if limit is set
    if (this.options.maxEntrySize) {
      const size = this.calculateSize(structure);
      if (size > this.options.maxEntrySize) {
        this.logger?.warn('DOM structure too large for cache', {
          url,
          sizeKB: Math.round(size / 1024),
          maxSizeKB: Math.round(this.options.maxEntrySize / 1024)
        });
        return;
      }
    }

    // Remove old entry if exists
    if (this.cache.has(url)) {
      this.remove(url);
    }

    // Add new entry
    const entry: CacheEntry = {
      structure,
      timestamp: Date.now(),
      size: this.calculateSize(structure)
    };

    this.cache.set(url, entry);
    this.accessOrder.push(url);

    // Evict if cache is full
    while (this.cache.size > this.options.maxSize) {
      this.evictLRU();
    }

    this.logger?.debug('DOM structure cached', {
      url,
      sizeKB: Math.round(entry.size / 1024),
      cacheSize: this.cache.size
    });
  }

  /**
   * Get a DOM structure from cache
   * Returns null if not found or expired
   */
  get(url: string): string | null {
    const entry = this.cache.get(url);

    if (!entry) {
      this.logger?.debug('DOM cache miss', { url });
      return null;
    }

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > this.options.ttl) {
      this.logger?.debug('DOM cache entry expired', {
        url,
        ageSeconds: Math.round(age / 1000),
        ttlSeconds: Math.round(this.options.ttl / 1000)
      });
      this.remove(url);
      return null;
    }

    // Update access order (move to end)
    this.updateAccessOrder(url);

    this.logger?.debug('DOM cache hit', {
      url,
      ageSeconds: Math.round(age / 1000),
      sizeKB: Math.round(entry.size / 1024)
    });

    return entry.structure;
  }

  /**
   * Remove a specific entry
   */
  remove(url: string): void {
    if (this.cache.has(url)) {
      this.cache.delete(url);
      this.accessOrder = this.accessOrder.filter(key => key !== url);
      this.logger?.debug('DOM cache entry removed', { url });
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];
    this.logger?.info('DOM cache cleared', { entriesRemoved: size });
  }

  /**
   * Check if URL is in cache
   */
  has(url: string): boolean {
    const entry = this.cache.get(url);
    if (!entry) {
      return false;
    }

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > this.options.ttl) {
      this.remove(url);
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    totalSizeKB: number;
    oldestEntryAgeSeconds: number | null;
    newestEntryAgeSeconds: number | null;
  } {
    let totalSize = 0;
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const entry of this.cache.values()) {
      totalSize += entry.size;
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      if (newestTimestamp === null || entry.timestamp > newestTimestamp) {
        newestTimestamp = entry.timestamp;
      }
    }

    const now = Date.now();

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      totalSizeKB: Math.round(totalSize / 1024),
      oldestEntryAgeSeconds: oldestTimestamp !== null ? Math.round((now - oldestTimestamp) / 1000) : null,
      newestEntryAgeSeconds: newestTimestamp !== null ? Math.round((now - newestTimestamp) / 1000) : null
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder.shift()!;
    const entry = this.cache.get(lruKey);
    this.cache.delete(lruKey);

    this.logger?.debug('DOM cache LRU eviction', {
      url: lruKey,
      ageSeconds: entry ? Math.round((Date.now() - entry.timestamp) / 1000) : 0,
      cacheSize: this.cache.size
    });
  }

  /**
   * Update access order for a key (move to end)
   */
  private updateAccessOrder(url: string): void {
    this.accessOrder = this.accessOrder.filter(key => key !== url);
    this.accessOrder.push(url);
  }

  /**
   * Calculate size of a string in bytes
   */
  private calculateSize(str: string): number {
    // Approximate size in bytes (UTF-8)
    // Each character can be 1-4 bytes in UTF-8
    // This is a rough estimate
    return new Blob([str]).size;
  }

  /**
   * Clean up expired entries
   */
  cleanupExpired(): number {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [url, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.options.ttl) {
        toRemove.push(url);
      }
    }

    toRemove.forEach(url => this.remove(url));

    if (toRemove.length > 0) {
      this.logger?.info('DOM cache cleanup completed', {
        entriesRemoved: toRemove.length,
        remainingEntries: this.cache.size
      });
    }

    return toRemove.length;
  }
}

/**
 * Create a DOM cache with default configuration
 */
export function createDefaultDOMCache(logger?: ILogger): DOMCache {
  return new DOMCache(
    {
      maxSize: 100,        // Max 100 entries
      ttl: 60000,          // 60 seconds TTL
      maxEntrySize: 500 * 1024  // 500KB max per entry
    },
    logger
  );
}
