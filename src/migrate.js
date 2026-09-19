import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '../sql');

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS karven_schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  for (const filename of files) {
    const seen = await pool.query('SELECT 1 FROM karven_schema_migrations WHERE filename=$1', [filename]);
    if (seen.rowCount) continue;
    const sql = await readFile(path.join(dir, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO karven_schema_migrations(filename) VALUES($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  console.log('KARVEN migrations complete');
} catch (error) {
  console.error('KARVEN migration failed', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
