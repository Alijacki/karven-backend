import { query } from '../db.js';
import { requireAuth, requireWorkspaceRole, requirePlatformAdmin } from '../auth.js';
import { fileSchema, webhookSchema, planSchema } from '../schema.js';
import { newOpaqueToken } from '../security.js';
import { storageReady, presignUpload } from '../storage.js';
import { audit, emitOutbox } from '../events.js';

export default async function platformRoutes(app) {
  const viewer=[requireAuth,requireWorkspaceRole('viewer')];
  const manager=[requireAuth,requireWorkspaceRole('manager')];

  app.get('/api/v1/workspaces/:workspaceId/files',{preHandler:viewer},async req=>({
    items:(await query(
      'SELECT id,name,mime_type,size_bytes,storage_key,status,uploaded_by,created_at,completed_at FROM karven_files WHERE workspace_id=$1 AND status<>$2 ORDER BY created_at DESC LIMIT 500',
      [req.params.workspaceId,'deleted']
    )).rows
  }));

  app.post('/api/v1/workspaces/:workspaceId/files/presign',{preHandler:[requireAuth,requireWorkspaceRole('member')]},async(req,reply)=>{
    if(!storageReady()) return reply.code(503).send({error:'storage_not_configured'});
    const parsed=fileSchema.safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:'validation_error',details:parsed.error.flatten()});
    const v=parsed.data;
    const key=`${req.params.workspaceId}/${new Date().toISOString().slice(0,10)}/${newOpaqueToken(18)}-${v.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)}`;
    const row=(await query(
      'INSERT INTO karven_files(workspace_id,uploaded_by,name,mime_type,size_bytes,storage_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.workspaceId,req.auth.userId,v.name,v.mimeType,v.sizeBytes,key]
    )).rows[0];
    const uploadUrl=await presignUpload({key,contentType:v.mimeType});
    await audit({workspaceId:req.params.workspaceId,userId:req.auth.userId,action:'presign',entityType:'file',entityId:row.id});
    return reply.code(201).send({file:row,uploadUrl,expiresInSeconds:900});
  });

  app.post('/api/v1/workspaces/:workspaceId/files/:id/complete',{preHandler:[requireAuth,requireWorkspaceRole('member')]},async(req,reply)=>{
    const row=(await query(
      'UPDATE karven_files SET status=$3,completed_at=now() WHERE id=$1 AND workspace_id=$2 AND status=$4 RETURNING *',
      [req.params.id,req.params.workspaceId,'ready','pending']
    )).rows[0];
    if(!row)return reply.code(404).send({error:'not_found'});
    await emitOutbox({workspaceId:req.params.workspaceId,eventType:'file.ready',aggregateType:'file',aggregateId:row.id,payload:{name:row.name,mimeType:row.mime_type,sizeBytes:Number(row.size_bytes)}});
    return row;
  });

  app.get('/api/v1/workspaces/:workspaceId/webhooks',{preHandler:manager},async req=>({
    items:(await query('SELECT id,url,events,active,created_by,created_at,updated_at FROM karven_webhooks WHERE workspace_id=$1 ORDER BY created_at DESC',[req.params.workspaceId])).rows
  }));

  app.post('/api/v1/workspaces/:workspaceId/webhooks',{preHandler:manager},async(req,reply)=>{
    const parsed=webhookSchema.safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:'validation_error'});
    const v=parsed.data, secret=newOpaqueToken(32);
    const row=(await query(
      'INSERT INTO karven_webhooks(workspace_id,url,secret,events,active,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,url,events,active,created_at',
      [req.params.workspaceId,v.url,secret,v.events,v.active,req.auth.userId]
    )).rows[0];
    await audit({workspaceId:req.params.workspaceId,userId:req.auth.userId,action:'create',entityType:'webhook',entityId:row.id});
    return reply.code(201).send({...row,secret});
  });

  app.patch('/api/v1/workspaces/:workspaceId/webhooks/:id',{preHandler:manager},async(req,reply)=>{
    const parsed=webhookSchema.partial().safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:'validation_error'});
    const current=(await query('SELECT * FROM karven_webhooks WHERE id=$1 AND workspace_id=$2',[req.params.id,req.params.workspaceId])).rows[0];
    if(!current)return reply.code(404).send({error:'not_found'});
    const v={url:current.url,events:current.events,active:current.active,...parsed.data};
    const row=(await query(
      'UPDATE karven_webhooks SET url=$3,events=$4,active=$5,updated_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING id,url,events,active,updated_at',
      [req.params.id,req.params.workspaceId,v.url,v.events,v.active]
    )).rows[0];
    return row;
  });

  app.delete('/api/v1/workspaces/:workspaceId/webhooks/:id',{preHandler:manager},async(req,reply)=>{
    const row=(await query('DELETE FROM karven_webhooks WHERE id=$1 AND workspace_id=$2 RETURNING id',[req.params.id,req.params.workspaceId])).rows[0];
    if(!row)return reply.code(404).send({error:'not_found'});
    return {deleted:true,id:row.id};
  });

  app.get('/api/v1/workspaces/:workspaceId/settings',{preHandler:viewer},async req=>({
    items:(await query('SELECT key,value,updated_at FROM karven_workspace_settings WHERE workspace_id=$1 ORDER BY key',[req.params.workspaceId])).rows
  }));

  app.put('/api/v1/workspaces/:workspaceId/settings/:key',{preHandler:manager},async(req,reply)=>{
    const key=String(req.params.key||'').trim();
    if(!/^[a-zA-Z0-9_.-]{1,120}$/.test(key))return reply.code(400).send({error:'invalid_key'});
    const value=req.body?.value ?? {};
    const row=(await query(
      'INSERT INTO karven_workspace_settings(workspace_id,key,value) VALUES($1,$2,$3) ON CONFLICT(workspace_id,key) DO UPDATE SET value=EXCLUDED.value,updated_at=now() RETURNING key,value,updated_at',
      [req.params.workspaceId,key,value]
    )).rows[0];
    await audit({workspaceId:req.params.workspaceId,userId:req.auth.userId,action:'update',entityType:'setting',entityId:key});
    return row;
  });

  app.get('/api/v1/workspaces/:workspaceId/audit',{preHandler:[requireAuth,requireWorkspaceRole('admin')]},async req=>({
    items:(await query('SELECT * FROM karven_audit_v2 WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 500',[req.params.workspaceId])).rows
  }));

  app.get('/api/v1/workspaces/:workspaceId/billing',{preHandler:viewer},async req=>{
    const [subscription,invoices,payments]=await Promise.all([
      query('SELECT s.*,p.code plan_code,p.name plan_name,p.features FROM karven_subscriptions s LEFT JOIN karven_plans_v2 p ON p.id=s.plan_id WHERE s.workspace_id=$1 ORDER BY s.created_at DESC LIMIT 1',[req.params.workspaceId]),
      query('SELECT * FROM karven_invoices WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',[req.params.workspaceId]),
      query('SELECT * FROM karven_payments_v2 WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',[req.params.workspaceId])
    ]);
    return {subscription:subscription.rows[0]||null,invoices:invoices.rows,payments:payments.rows};
  });

  app.get('/api/v1/plans',async()=>({
    items:(await query('SELECT id,code,name,price_cents,currency,interval,features FROM karven_plans_v2 WHERE active=true ORDER BY price_cents')).rows
  }));

  app.get('/api/admin/overview',{preHandler:requirePlatformAdmin},async()=>{
    const [users,workspaces,subscriptions,payments]=await Promise.all([
      query('SELECT count(*)::int count FROM karven_users'),
      query('SELECT count(*)::int count FROM karven_workspaces'),
      query("SELECT count(*)::int count FROM karven_subscriptions WHERE status IN ('trialing','active','past_due')"),
      query("SELECT COALESCE(sum(amount_cents),0)::bigint total FROM karven_payments_v2 WHERE status='paid'")
    ]);
    return {users:users.rows[0].count,workspaces:workspaces.rows[0].count,activeSubscriptions:subscriptions.rows[0].count,paidVolumeCents:Number(payments.rows[0].total)};
  });

  app.get('/api/admin/plans',{preHandler:requirePlatformAdmin},async()=>({items:(await query('SELECT * FROM karven_plans_v2 ORDER BY created_at DESC')).rows}));

  app.post('/api/admin/plans',{preHandler:requirePlatformAdmin},async(req,reply)=>{
    const parsed=planSchema.safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:'validation_error',details:parsed.error.flatten()});
    const v=parsed.data;
    const row=(await query(
      'INSERT INTO karven_plans_v2(code,name,price_cents,currency,interval,features,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [v.code,v.name,v.priceCents,v.currency,v.interval,v.features,v.active]
    )).rows[0];
    return reply.code(201).send(row);
  });

  app.get('/api/admin/workspaces',{preHandler:requirePlatformAdmin},async()=>({
    items:(await query('SELECT w.*,count(m.user_id)::int member_count FROM karven_workspaces w LEFT JOIN karven_memberships m ON m.workspace_id=w.id GROUP BY w.id ORDER BY w.created_at DESC LIMIT 1000')).rows
  }));
}
