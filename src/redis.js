import Redis from 'ioredis';
import { config } from './config.js';

export function createRedisConnection(extra = {}) {
  if (!config.redisUrl) return null;
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 10000,
    lazyConnect: true,
    ...extra
  });
}

export const redis = createRedisConnection({ maxRetriesPerRequest: 2 });

export async function ensureRedis(client = redis) {
  if (!client) return false;
  if (client.status === 'wait' || client.status === 'end') await client.connect();
  return true;
}
