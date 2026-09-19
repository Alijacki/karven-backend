import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
if (!config.databaseUrl) throw new Error('DATABASE_URL is required');

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: process.env.PGSSL === 'disable' ? false : undefined,
  max: config.pgPoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000
});

export function query(text, params = []) {
  return pool.query(text, params);
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
