import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.PG_DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSL === 'disable' ? false : undefined,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
