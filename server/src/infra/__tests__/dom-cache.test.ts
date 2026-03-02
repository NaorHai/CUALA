import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOMCache, createDefaultDOMCache } from '../dom-cache.js';

describe('DOMCache', () => {
  let cache: DOMCache;

  beforeEach(() => {
    cache = new DOMCache({
      maxSize: 5,
      ttl: 60000, // 60 seconds
      maxEntrySize: 100 * 1024 // 100KB
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('set and get', () => {
    it('should store and retrieve DOM structure', () => {
      const url = 'https://example.com';
      const structure = '<html><body>Test</body></html>';

      cache.set(url, structure);
      const retrieved = cache.get(url);

      expect(retrieved).toBe(structure);
    });

    it('should return null for non-existent entry', () => {
      const retrieved = cache.get('https://nonexistent.com');
      expect(retrieved).toBeNull();
    });

    it('should update existing entry', () => {
      const url = 'https://example.com';

      cache.set(url, 'structure1');
      cache.set(url, 'structure2');

      expect(cache.get(url)).toBe('structure2');
      expect(cache.getStats().size).toBe(1);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entry after TTL', () => {
      const url = 'https://example.com';
      const structure = '<html><body>Test</body></html>';

      cache.set(url, structure);
      expect(cache.get(url)).toBe(structure);

      // Advance time beyond TTL
      vi.advanceTimersByTime(61000);

      expect(cache.get(url)).toBeNull();
    });

    it('should not expire entry before TTL', () => {
      const url = 'https://example.com';
      const structure = '<html><body>Test</body></html>';

      cache.set(url, structure);

      // Advance time but not past TTL
      vi.advanceTimersByTime(30000);

      expect(cache.get(url)).toBe(structure);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when cache is full', () => {
      // Fill cache to max (5 entries)
      for (let i = 1; i <= 5; i++) {
        cache.set(`https://example${i}.com`, `structure${i}`);
      }

      expect(cache.getStats().size).toBe(5);

      // Add one more entry - should evict first entry
      cache.set('https://example6.com', 'structure6');

      expect(cache.getStats().size).toBe(5);
      expect(cache.get('https://example1.com')).toBeNull(); // Evicted
      expect(cache.get('https://example6.com')).toBe('structure6');
    });

    it('should update LRU order on access', () => {
      // Fill cache
      for (let i = 1; i <= 5; i++) {
        cache.set(`https://example${i}.com`, `structure${i}`);
      }

      // Access first entry to make it more recently used
      cache.get('https://example1.com');

      // Add new entry - should evict example2 (now LRU)
      cache.set('https://example6.com', 'structure6');

      expect(cache.get('https://example1.com')).not.toBeNull(); // Not evicted
      expect(cache.get('https://example2.com')).toBeNull(); // Evicted
    });
  });

  describe('size limits', () => {
    it('should reject entry exceeding max size', () => {
      const cache = new DOMCache({
        maxSize: 5,
        ttl: 60000,
        maxEntrySize: 100 // Very small limit
      });

      const url = 'https://example.com';
      const largeStructure = 'x'.repeat(200); // Exceeds limit

      cache.set(url, largeStructure);

      // Entry should not be cached
      expect(cache.get(url)).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });

    it('should accept entry within size limit', () => {
      const cache = new DOMCache({
        maxSize: 5,
        ttl: 60000,
        maxEntrySize: 1000
      });

      const url = 'https://example.com';
      const structure = 'x'.repeat(500); // Within limit

      cache.set(url, structure);

      expect(cache.get(url)).toBe(structure);
      expect(cache.getStats().size).toBe(1);
    });
  });

  describe('has', () => {
    it('should return true for existing entry', () => {
      const url = 'https://example.com';
      cache.set(url, 'structure');

      expect(cache.has(url)).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      expect(cache.has('https://nonexistent.com')).toBe(false);
    });

    it('should return false for expired entry', () => {
      const url = 'https://example.com';
      cache.set(url, 'structure');

      vi.advanceTimersByTime(61000);

      expect(cache.has(url)).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove entry', () => {
      const url = 'https://example.com';
      cache.set(url, 'structure');

      expect(cache.get(url)).toBe('structure');

      cache.remove(url);

      expect(cache.get(url)).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });

    it('should handle removing non-existent entry', () => {
      cache.remove('https://nonexistent.com');
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      for (let i = 1; i <= 5; i++) {
        cache.set(`https://example${i}.com`, `structure${i}`);
      }

      expect(cache.getStats().size).toBe(5);

      cache.clear();

      expect(cache.getStats().size).toBe(0);
      expect(cache.get('https://example1.com')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return accurate stats', () => {
      cache.set('https://example1.com', 'structure1');
      cache.set('https://example2.com', 'structure2');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
      // totalSizeKB could be 0 for very small strings
      expect(stats.totalSizeKB).toBeGreaterThanOrEqual(0);
      expect(stats.oldestEntryAgeSeconds).toBeGreaterThanOrEqual(0);
      expect(stats.newestEntryAgeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should return null ages for empty cache', () => {
      const stats = cache.getStats();

      expect(stats.size).toBe(0);
      expect(stats.oldestEntryAgeSeconds).toBeNull();
      expect(stats.newestEntryAgeSeconds).toBeNull();
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired entries', () => {
      // Add entries
      cache.set('https://example1.com', 'structure1');
      cache.set('https://example2.com', 'structure2');

      // Advance time to expire entries
      vi.advanceTimersByTime(61000);

      // Add fresh entry
      cache.set('https://example3.com', 'structure3');

      const removed = cache.cleanupExpired();

      expect(removed).toBe(2); // Two expired entries removed
      expect(cache.getStats().size).toBe(1);
      expect(cache.get('https://example3.com')).not.toBeNull();
    });

    it('should return 0 when no entries expired', () => {
      cache.set('https://example.com', 'structure');

      const removed = cache.cleanupExpired();

      expect(removed).toBe(0);
      expect(cache.getStats().size).toBe(1);
    });
  });
});

describe('createDefaultDOMCache', () => {
  it('should create cache with default configuration', () => {
    const cache = createDefaultDOMCache();
    expect(cache).toBeInstanceOf(DOMCache);

    // Test it works
    cache.set('https://example.com', 'structure');
    expect(cache.get('https://example.com')).toBe('structure');
  });
});
