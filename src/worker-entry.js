import { assertRuntimeConfig } from './config.js';
import { startWorker } from './worker.js';
import { closeQueue } from './queue.js';
import { pool } from './db.js';
import { redis } from './redis.js';

assertRuntimeConfig();
const worker=await startWorker();

async function shutdown(signal){
  console.log(`KARVEN worker shutdown: ${signal}`);
  try{await worker.close();}catch{}
  try{await closeQueue();}catch{}
  try{redis?.disconnect();}catch{}
  try{await pool.end();}catch{}
  process.exit(0);
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
