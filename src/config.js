const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const integer = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: integer('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL || process.env.PG_DATABASE_URL,
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret: process.env.KARVEN_JWT_SECRET || '',
  adminApiKey: process.env.KARVEN_ADMIN_API_KEY || '',
  allowedOrigins: (process.env.KARVEN_ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean),
  appUrl: (process.env.KARVEN_APP_URL || '').replace(/\/$/, ''),
  runWorker: String(process.env.KARVEN_RUN_WORKER || 'false').toLowerCase() === 'true',
  metricsToken: process.env.KARVEN_METRICS_TOKEN || '',
  accessTokenMinutes: integer('ACCESS_TOKEN_TTL_MINUTES', 15),
  refreshTokenDays: integer('REFRESH_TOKEN_TTL_DAYS', 30),
  rateLimitMax: integer('RATE_LIMIT_MAX', 300),
  pgPoolMax: integer('PG_POOL_MAX', 20)
};

export function assertRuntimeConfig() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  if (config.jwtSecret.length < 32) throw new Error('KARVEN_JWT_SECRET must be at least 32 characters');
  if (config.adminApiKey.length < 32) throw new Error('KARVEN_ADMIN_API_KEY must be at least 32 characters');
}
