import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = await readFile(path.join(here, '../sql/001_init.sql'), 'utf8');

try {
  await pool.query('BEGIN');
  await pool.query(sql);
  await pool.query('COMMIT');
  console.log('KARVEN migration complete');
} catch (error) {
  await pool.query('ROLLBACK');
  console.error('KARVEN migration failed', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
