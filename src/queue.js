import { Queue } from 'bullmq';
import { config } from './config.js';
import { createRedisConnection } from './redis.js';

let queue;

export function getQueue() {
  if (!config.redisUrl) return null;
  if (!queue) queue = new Queue('karven', { connection: createRedisConnection() });
  return queue;
}

export async function enqueue(name, data, options = {}) {
  const q = getQueue();
  if (!q) throw new Error('Redis queue is not configured');
  return q.add(name, data, {
    attempts: 6,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
    ...options
  });
}

export async function closeQueue() {
  if (queue) await queue.close();
}
