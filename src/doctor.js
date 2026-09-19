import { pool } from './db.js';
import { redis, ensureRedis } from './redis.js';
import { storageReady } from './storage.js';
import { config } from './config.js';

const report={database:'down',redis:redis?'down':'missing',storage:storageReady()?'configured':'optional_missing',smtp:process.env.SMTP_HOST?'configured':'optional_missing',worker:config.runWorker?'embedded':'separate_or_disabled'};

try{
  await pool.query('SELECT 1');
  report.database='ok';
}catch(error){
  report.database=`error:${error.message}`;
}

if(redis){
  try{
    await ensureRedis();
    report.redis=(await redis.ping())==='PONG'?'ok':'unexpected';
  }catch(error){
    report.redis=`error:${error.message}`;
  }
}

console.log(JSON.stringify({service:'KARVEN Backend Doctor',...report},null,2));
try{redis?.disconnect();}catch{}
await pool.end();

if(report.database!=='ok' || (config.runWorker && report.redis!=='ok')) process.exitCode=1;
