import crypto from 'node:crypto';
import { Worker } from 'bullmq';
import { createRedisConnection } from './redis.js';
import { query, tx } from './db.js';
import { enqueue } from './queue.js';
import { sendMail } from './mail.js';

async function deliverWebhook(deliveryId) {
  const result=await query(
    'SELECT d.id,d.event_type,d.payload,d.attempts,w.url,w.secret,w.active FROM karven_webhook_deliveries d JOIN karven_webhooks w ON w.id=d.webhook_id WHERE d.id=$1',
    [deliveryId]
  );
  const d=result.rows[0];
  if(!d || !d.active || d.status==='delivered') return;
  const body=JSON.stringify({id:d.id,type:d.event_type,data:d.payload});
  const signature=crypto.createHmac('sha256',d.secret).update(body).digest('hex');
  try{
    const response=await fetch(d.url,{
      method:'POST',
      headers:{'content-type':'application/json','user-agent':'KARVEN-Webhooks/1.0','x-karven-event':d.event_type,'x-karven-signature':`sha256=${signature}`},
      body,
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    await query('UPDATE karven_webhook_deliveries SET status=$2,attempts=attempts+1,response_status=$3,delivered_at=now(),last_error=NULL WHERE id=$1',[d.id,'delivered',response.status]);
  }catch(error){
    await query('UPDATE karven_webhook_deliveries SET status=$2,attempts=attempts+1,last_error=$3,next_attempt_at=now()+interval \'5 minutes\' WHERE id=$1',[d.id,'failed',String(error.message||error).slice(0,2000)]);
    throw error;
  }
}

async function pumpOutbox() {
  const deliveries=await tx(async client=>{
    const events=await client.query(
      "SELECT * FROM karven_outbox WHERE status='pending' AND available_at<=now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 50"
    );
    const jobs=[];
    for(const event of events.rows){
      const hooks=await client.query(
        "SELECT id FROM karven_webhooks WHERE workspace_id=$1 AND active=true AND events ? $2",
        [event.workspace_id,event.event_type]
      );
      for(const hook of hooks.rows){
        const delivery=(await client.query(
          'INSERT INTO karven_webhook_deliveries(webhook_id,event_type,payload) VALUES($1,$2,$3) RETURNING id',
          [hook.id,event.event_type,{aggregateType:event.aggregate_type,aggregateId:event.aggregate_id,...event.payload}]
        )).rows[0];
        jobs.push(delivery.id);
      }
      await client.query("UPDATE karven_outbox SET status='dispatched',dispatched_at=now() WHERE id=$1",[event.id]);
    }
    return jobs;
  });
  for(const deliveryId of deliveries) await enqueue('webhook.deliver',{deliveryId});
}

export async function startWorker() {
  const connection=createRedisConnection();
  if(!connection) throw new Error('REDIS_URL is required to run the worker');
  const worker=new Worker('karven',async job=>{
    if(job.name==='email.send') return sendMail(job.data);
    if(job.name==='webhook.deliver') return deliverWebhook(job.data.deliveryId);
    if(job.name==='outbox.pump') return pumpOutbox();
    throw new Error(`Unknown KARVEN job: ${job.name}`);
  },{connection,concurrency:Number(process.env.KARVEN_WORKER_CONCURRENCY||10)});

  const timer=setInterval(()=>enqueue('outbox.pump',{}, {jobId:`outbox-${Math.floor(Date.now()/3000)}`,attempts:1}).catch(()=>{}),3000);
  timer.unref();

  worker.on('failed',(job,error)=>console.error('KARVEN worker job failed',job?.name,error));
  return {
    async close(){
      clearInterval(timer);
      await worker.close();
      try{connection.disconnect();}catch{}
    }
  };
}
