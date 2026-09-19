import { query, tx } from '../db.js';
import { requireAuth, requireWorkspaceRole } from '../auth.js';
import { companySchema, contactSchema, pipelineSchema, opportunitySchema, taskSchema, noteSchema } from '../schema.js';
import { audit, emitOutbox } from '../events.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idOk=v=>uuid.test(String(v||''));
const limitOf=req=>Math.min(Math.max(Number(req.query?.limit||100),1),500);
const offsetOf=req=>Math.max(Number(req.query?.offset||0),0);

async function afterWrite(req, action, type, id, payload={}) {
  await audit({workspaceId:req.params.workspaceId,userId:req.auth.userId,action,entityType:type,entityId:id,payload});
  await emitOutbox({workspaceId:req.params.workspaceId,eventType:`${type}.${action}`,aggregateType:type,aggregateId:id,payload});
}

export default async function crmRoutes(app) {
  const viewer=[requireAuth,requireWorkspaceRole('viewer')];
  const member=[requireAuth,requireWorkspaceRole('member')];

  app.get('/api/v1/workspaces/:workspaceId/companies',{preHandler:viewer},async req=>{
    const q=String(req.query?.q||'').trim();
    const result=await query(
      `SELECT * FROM karven_companies WHERE workspace_id=$1 AND ($2='' OR name ILIKE '%'||$2||'%' OR domain ILIKE '%'||$2||'%') ORDER BY updated_at DESC LIMIT $3 OFFSET $4`,
      [req.params.workspaceId,q,limitOf(req),offsetOf(req)]
    );
    return {items:result.rows};
  });

  app.post('/api/v1/workspaces/:workspaceId/companies',{preHandler:member},async(req,reply)=>{
    const p=companySchema.safeParse(req.body); if(!p.success)return reply.code(400).send({error:'validation_error',details:p.error.flatten()});
    const v=p.data;
    const row=(await query(
      'INSERT INTO karven_companies(workspace_id,name,domain,email,phone,website,owner_user_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [req.params.workspaceId,v.name,v.domain,v.email,v.phone,v.website,v.ownerUserId,v.metadata]
    )).rows[0];
    await afterWrite(req,'created','company',row.id,{name:row.name}); return reply.code(201).send(row);
  });

  app.patch('/api/v1/workspaces/:workspaceId/companies/:id',{preHandler:member},async(req,reply)=>{
    if(!idOk(req.params.id))return reply.code(400).send({error:'invalid_id'});
    const p=companySchema.partial().safeParse(req.body); if(!p.success)return reply.code(400).send({error:'validation_error'});
    const current=(await query('SELECT * FROM karven_companies WHERE id=$1 AND workspace_id=$2',[req.params.id,req.params.workspaceId])).rows[0];
    if(!current)return reply.code(404).send({error:'not_found'});
    const v={name:current.name,domain:current.domain,email:current.email,phone:current.phone,website:current.website,ownerUserId:current.owner_user_id,metadata:current.metadata,...p.data};
    const row=(await query(
      'UPDATE karven_companies SET name=$3,domain=$4,email=$5,phone=$6,website=$7,owner_user_id=$8,metadata=$9,updated_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING *',
      [req.params.id,req.params.workspaceId,v.name,v.domain,v.email,v.phone,v.website,v.ownerUserId,v.metadata]
    )).rows[0];
    await afterWrite(req,'updated','company',row.id); return row;
  });

  app.delete('/api/v1/workspaces/:workspaceId/companies/:id',{preHandler:member},async(req,reply)=>{
    const row=(await query('DELETE FROM karven_companies WHERE id=$1 AND workspace_id=$2 RETURNING id',[req.params.id,req.params.workspaceId])).rows[0];
    if(!row)return reply.code(404).send({error:'not_found'});
    await afterWrite(req,'deleted','company',row.id); return {deleted:true,id:row.id};
  });

  app.get('/api/v1/workspaces/:workspaceId/contacts',{preHandler:viewer},async req=>{
    const q=String(req.query?.q||'').trim();
    const result=await query(
      `SELECT c.*,co.name company_name FROM karven_contacts c LEFT JOIN karven_companies co ON co.id=c.company_id WHERE c.workspace_id=$1 AND ($2='' OR c.first_name ILIKE '%'||$2||'%' OR c.last_name ILIKE '%'||$2||'%' OR c.email::text ILIKE '%'||$2||'%') ORDER BY c.updated_at DESC LIMIT $3 OFFSET $4`,
      [req.params.workspaceId,q,limitOf(req),offsetOf(req)]
    ); return {items:result.rows};
  });

  app.post('/api/v1/workspaces/:workspaceId/contacts',{preHandler:member},async(req,reply)=>{
    const p=contactSchema.safeParse(req.body);if(!p.success)return reply.code(400).send({error:'validation_error',details:p.error.flatten()});const v=p.data;
    const row=(await query(
      'INSERT INTO karven_contacts(workspace_id,company_id,first_name,last_name,email,phone,job_title,owner_user_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [req.params.workspaceId,v.companyId,v.firstName,v.lastName,v.email,v.phone,v.jobTitle,v.ownerUserId,v.metadata]
    )).rows[0];
    await afterWrite(req,'created','contact',row.id,{email:row.email});return reply.code(201).send(row);
  });

  app.patch('/api/v1/workspaces/:workspaceId/contacts/:id',{preHandler:member},async(req,reply)=>{
    const p=contactSchema.partial().safeParse(req.body);if(!p.success)return reply.code(400).send({error:'validation_error'});
    const c=(await query('SELECT * FROM karven_contacts WHERE id=$1 AND workspace_id=$2',[req.params.id,req.params.workspaceId])).rows[0];if(!c)return reply.code(404).send({error:'not_found'});
    const v={companyId:c.company_id,firstName:c.first_name,lastName:c.last_name,email:c.email,phone:c.phone,jobTitle:c.job_title,ownerUserId:c.owner_user_id,metadata:c.metadata,...p.data};
    const row=(await query(
      'UPDATE karven_contacts SET company_id=$3,first_name=$4,last_name=$5,email=$6,phone=$7,job_title=$8,owner_user_id=$9,metadata=$10,updated_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING *',
      [req.params.id,req.params.workspaceId,v.companyId,v.firstName,v.lastName,v.email,v.phone,v.jobTitle,v.ownerUserId,v.metadata]
    )).rows[0];await afterWrite(req,'updated','contact',row.id);return row;
  });

  app.delete('/api/v1/workspaces/:workspaceId/contacts/:id',{preHandler:member},async(req,reply)=>{
    const row=(await query('DELETE FROM karven_contacts WHERE id=$1 AND workspace_id=$2 RETURNING id',[req.params.id,req.params.workspaceId])).rows[0];
    if(!row)return reply.code(404).send({error:'not_found'});await afterWrite(req,'deleted','contact',row.id);return {deleted:true,id:row.id};
  });

  app.get('/api/v1/workspaces/:workspaceId/pipelines',{preHandler:viewer},async req=>{
    const pipelines=(await query('SELECT * FROM karven_pipelines WHERE workspace_id=$1 ORDER BY created_at',[req.params.workspaceId])).rows;
    const stages=(await query('SELECT s.* FROM karven_pipeline_stages s JOIN karven_pipelines p ON p.id=s.pipeline_id WHERE p.workspace_id=$1 ORDER BY s.pipeline_id,s.position',[req.params.workspaceId])).rows;
    return {items:pipelines.map(p=>({...p,stages:stages.filter(s=>s.pipeline_id===p.id)}))};
  });

  app.post('/api/v1/workspaces/:workspaceId/pipelines',{preHandler:[requireAuth,requireWorkspaceRole('manager')]},async(req,reply)=>{
    const p=pipelineSchema.safeParse(req.body);if(!p.success)return reply.code(400).send({error:'validation_error'});const v=p.data;
    const pipeline=await tx(async client=>{
      if(v.isDefault)await client.query('UPDATE karven_pipelines SET is_default=false WHERE workspace_id=$1',[req.params.workspaceId]);
      const row=(await client.query('INSERT INTO karven_pipelines(workspace_id,name,is_default) VALUES($1,$2,$3) RETURNING *',[req.params.workspaceId,v.name,v.isDefault])).rows[0];
      for(const s of v.stages)await client.query('INSERT INTO karven_pipeline_stages(pipeline_id,name,position,probability) VALUES($1,$2,$3,$4)',[row.id,s.name,s.position,s.probability]);
      return row;
    });await afterWrite(req,'created','pipeline',pipeline.id,{name:pipeline.name});return reply.code(201).send(pipeline);
  });

  app.get('/api/v1/workspaces/:workspaceId/opportunities',{preHandler:viewer},async req=>({
    items:(await query('SELECT * FROM karven_opportunities WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',[req.params.workspaceId,limitOf(req),offsetOf(req)])).rows
  }));

  app.post('/api/v1/workspaces/:workspaceId/opportunities',{preHandler:member},async(req,reply)=>{
    const p=opportunitySchema.safeParse(req.body);if(!p.success)return reply.code(400).send({error:'validation_error',details:p.error.flatten()});const v=p.data;
    const row=(await query(
      'INSERT INTO karven_opportunities(workspace_id,pipeline_id,stage_id,contact_id,company_id,owner_user_id,title,amount_cents,currency,probability,expected_close_date,status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
      [req.params.workspaceId,v.pipelineId,v.stageId,v.contactId,v.companyId,v.ownerUserId,v.title,v.amountCents,v.currency,v.probability,v.expectedCloseDate,v.status,v.metadata]
    )).rows[0];await afterWrite(req,'created','opportunity',row.id,{title:row.title});return reply.code(201).send(row);
  });

  app.patch('/api/v1/workspaces/:workspaceId/opportunities/:id',{preHandler:member},async(req,reply)=>{
    const p=opportunitySchema.partial().safeParse(req.body);if(!p.success)return reply.code(400).send({error:'validation_error'});
    const c=(await query('SELECT * FROM karven_opportunities WHERE id=$1 AND workspace_id=$2',[req.params.id,req.params.workspaceId])).rows[0];if(!c)return reply.code(404).send({error:'not_found'});
    const v={pipelineId:c.pipeline_id,stageId:c.stage_id,contactId:c.contact_id,companyId:c.company_id,ownerUserId:c.owner_user_id,title:c.title,amountCents:Number(c.amount_cents),currency:c.currency,probability:c.probability,expectedCloseDate:c.expected_close_date,status:c.status,metadata:c.metadata,...p.data};
    const row=(await query(
      'UPDATE karven_opportunities SET pipeline_id=$3,stage_id=$4,contact_id=$5,company_id=$6,owner_user_id=$7,title=$8,amount_cents=$9,currency=$10,probability=$11,expected_close_date=$12,status=$13,metadata=$14,updated_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING *',
      [req.params.id,req.params.workspaceId,v.pipelineId,v.stageId,v.contactId,v.companyId,v.ownerUserId,v.title,v.amountCents,v.currency,v.probability,v.expectedCloseDate,v.status,v.metadata]
    )).rows[0];await afterWrite(req,'updated','opportunity',row.id,{status:row.status});return row;
  });

  app.get('/api/v1/workspaces/:workspaceId/tasks',{preHandler:viewer},async req=>({
    items:(await query('SELECT * FROM karven_tasks WHERE workspace_id=$1 ORDER BY COALESCE(due_at,\'9999-12-31\'),created_at DESC LIMIT $2 OFFSET $3',[req.params.workspaceId,limitOf(req),offsetOf(req)])).rows
  }));

  app.post('/api/v1/workspaces/:workspaceId/tasks',{preHandler:member},async(req,reply)=>{
    const p=taskSchema.safeParse(req.body);if(!p.success)return reply.code(400).send({error:'validation_error'});const v=p.data;
    const row=(await query(
      'INSERT INTO karven_tasks(workspace_id,title,description,status,priority,due_at,assignee_user_id,created_by,linked_type,linked_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [req.params.workspaceId,v.title,v.description,v.status,v.priority,v.dueAt,v.assigneeUserId,req.auth.userId,v.linkedType,v.linkedId]
    )).rows[0];await afterWrite(req,'created','task',row.id,{title:row.title});return reply.code(201).send(row);
  });

  app.patch('/api/v1/workspaces/:workspaceId/tasks/:id',{preHandler:member},async(req,reply)=>{
    const p=taskSchema.partial().safeParse(req.body);if(!p.success)return reply.code(400).send({error:'validation_error'});
    const c=(await query('SELECT * FROM karven_tasks WHERE id=$1 AND workspace_id=$2',[req.params.id,req.params.workspaceId])).rows[0];if(!c)return reply.code(404).send({error:'not_found'});
    const v={title:c.title,description:c.description,status:c.status,priority:c.priority,dueAt:c.due_at,assigneeUserId:c.assignee_user_id,linkedType:c.linked_type,linkedId:c.linked_id,...p.data};
    const row=(await query(
      'UPDATE karven_tasks SET title=$3,description=$4,status=$5,priority=$6,due_at=$7,assignee_user_id=$8,linked_type=$9,linked_id=$10,updated_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING *',
      [req.params.id,req.params.workspaceId,v.title,v.description,v.status,v.priority,v.dueAt,v.assigneeUserId,v.linkedType,v.linkedId]
    )).rows[0];await afterWrite(req,'updated','task',row.id,{status:row.status});return row;
  });

  app.get('/api/v1/workspaces/:workspaceId/notes',{preHandler:viewer},async req=>{
    const linkedType=String(req.query?.linkedType||'');const linkedId=String(req.query?.linkedId||'');
    return {items:(await query(
      'SELECT * FROM karven_notes WHERE workspace_id=$1 AND ($2=\'\' OR linked_type=$2) AND ($3=\'\' OR linked_id::text=$3) ORDER BY created_at DESC LIMIT $4',
      [req.params.workspaceId,linkedType,linkedId,limitOf(req)]
    )).rows};
  });

  app.post('/api/v1/workspaces/:workspaceId/notes',{preHandler:member},async(req,reply)=>{
    const p=noteSchema.safeParse(req.body);if(!p.success)return reply.code(400).send({error:'validation_error'});const v=p.data;
    const row=(await query(
      'INSERT INTO karven_notes(workspace_id,author_user_id,body,linked_type,linked_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [req.params.workspaceId,req.auth.userId,v.body,v.linkedType,v.linkedId]
    )).rows[0];await afterWrite(req,'created','note',row.id);return reply.code(201).send(row);
  });

  app.get('/api/v1/workspaces/:workspaceId/activities',{preHandler:viewer},async req=>({
    items:(await query('SELECT * FROM karven_activities WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',[req.params.workspaceId,limitOf(req),offsetOf(req)])).rows
  }));
}
