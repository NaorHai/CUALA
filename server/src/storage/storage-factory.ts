/**
 * Factory for creating storage instances based on configuration.
 * Supports both in-memory and Redis storage backends.
 */

import { IStorage } from './index.js';
import { InMemoryStorage } from './in-memory-storage.js';
import { RedisStorage } from './redis-storage.js';

export type StorageType = 'memory' | 'redis';

/**
 * Create a storage instance based on STORAGE_TYPE environment variable.
 * Defaults to 'memory' if not specified.
 */
export async function createStorage(): Promise<IStorage> {
  const storageType = (process.env.STORAGE_TYPE || 'memory').toLowerCase() as StorageType;

  switch (storageType) {
    case 'redis': {
      const redisStorage = new RedisStorage(process.env.REDIS_URL);
      await redisStorage.connect();
      return redisStorage;
    }

    case 'memory':
    default:
      return new InMemoryStorage();
  }
}

/**
 * Get the configured storage type
 */
export function getStorageType(): StorageType {
  return (process.env.STORAGE_TYPE || 'memory').toLowerCase() as StorageType;
}

