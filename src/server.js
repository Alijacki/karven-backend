import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config, assertRuntimeConfig } from './config.js';
import { query, pool } from './db.js';
import { redis, ensureRedis } from './redis.js';
import { closeQueue } from './queue.js';
import { registry, httpDuration } from './metrics.js';
import { startWorker } from './worker.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import crmRoutes from './routes/crm.js';
import platformRoutes from './routes/platform.js';

assertRuntimeConfig();

const app=Fastify({logger:true,trustProxy:true,bodyLimit:2*1024*1024});

await app.register(helmet,{contentSecurityPolicy:false});
await app.register(cors,{origin:config.allowedOrigins.length?config.allowedOrigins:false,credentials:true});
await app.register(rateLimit,{
  max:config.rateLimitMax,
  timeWindow:'1 minute',
  ...(redis?{redis}:{})
});

app.addHook('onRequest',async req=>{req.karvenStart=process.hrtime.bigint();});
app.addHook('onResponse',async(req,reply)=>{
  const start=req.karvenStart;
  if(!start)return;
  const seconds=Number(process.hrtime.bigint()-start)/1e9;
  httpDuration.observe({
    method:req.method,
    route:req.routeOptions?.url||'unknown',
    status:String(reply.statusCode)
  },seconds);
});

async function dependencies(){
  let database='down',cache=redis?'down':'disabled';
  try{await query('SELECT 1');database='ok';}catch{}
  if(redis){try{await ensureRedis();await redis.ping();cache='ok';}catch{}}
  return {database,redis:cache,ok:database==='ok'&&cache!=='down'};
}

app.get('/',async()=>({service:'KARVEN Backend',version:'2.0.0',status:'ok'}));
app.get('/health',async()=>({service:'KARVEN Backend',version:'2.0.0',...(await dependencies())}));
app.get('/ready',async(_req,reply)=>{
  const d=await dependencies();
  return reply.code(d.ok?200:503).send({service:'KARVEN Backend',status:d.ok?'ready':'not_ready',...d});
});
app.get('/metrics',async(req,reply)=>{
  if(config.metricsToken && req.headers.authorization!==`Bearer ${config.metricsToken}`)return reply.code(401).send({error:'unauthorized'});
  reply.header('content-type',registry.contentType);
  return registry.metrics();
});

await app.register(authRoutes);
await app.register(workspaceRoutes);
await app.register(crmRoutes);
await app.register(platformRoutes);

app.setNotFoundHandler((_req,reply)=>reply.code(404).send({error:'not_found'}));
app.setErrorHandler((error,req,reply)=>{
  req.log.error(error);
  const status=error.statusCode&&error.statusCode<500?error.statusCode:500;
  reply.code(status).send({error:status>=500?'internal_error':error.name||'request_error'});
});

let workerHandle=null;
if(config.runWorker){
  workerHandle=await startWorker();
  app.log.info('KARVEN embedded worker started');
}

await app.listen({port:config.port,host:config.host});

async function shutdown(signal){
  app.log.info({signal},'KARVEN shutdown');
  try{await workerHandle?.close();}catch{}
  try{await closeQueue();}catch{}
  try{await app.close();}catch{}
  try{redis?.disconnect();}catch{}
  try{await pool.end();}catch{}
  process.exit(0);
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
