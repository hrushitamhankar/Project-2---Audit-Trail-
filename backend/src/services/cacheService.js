/**
 * In-Memory LRU-Style Cache Service (P3 Ownership)
 * Caches serialized Read Models to eliminate repeat DB roundtrips.
 */
class ReadModelCache {
  constructor(ttlMs = 60000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttlMs,
    });
  }

  invalidate(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

const cacheInstance = new ReadModelCache();
module.exports = cacheInstance;