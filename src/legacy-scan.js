import { pool } from './db.js';

const tables=(await pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT LIKE 'karven_%' ORDER BY table_name"
)).rows.map(r=>r.table_name);

const report=[];
for(const name of tables){
  if(!/^[A-Za-z0-9_]+$/.test(name)) continue;
  try{
    const count=(await pool.query(`SELECT count(*)::bigint AS count FROM "${name}"`)).rows[0].count;
    report.push({table:name,count:Number(count)});
  }catch(error){
    report.push({table:name,error:error.message});
  }
}

console.log(JSON.stringify({scannedAt:new Date().toISOString(),externalTables:report},null,2));
await pool.end();
