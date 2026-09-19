import Redis from 'ioredis';

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 10000,
    })
  : null;

export async function ensureRedis() {
  if (!redis) return false;
  if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
  return true;
}
