import { query, tx } from '../db.js';
import { requireAuth, requireWorkspaceRole } from '../auth.js';
import { workspaceSchema, memberSchema } from '../schema.js';
import { newOpaqueToken, hashToken } from '../security.js';
import { enqueue } from '../queue.js';
import { audit, emitOutbox } from '../events.js';

function slugify(value) {
  return `${String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48) || 'workspace'}-${newOpaqueToken(5).toLowerCase()}`;
}

export default async function workspaceRoutes(app) {
  app.get('/api/v1/workspaces', { preHandler: requireAuth }, async req => ({
    items:(await query(
      'SELECT w.id,w.name,w.slug,w.status,m.role,w.created_at,w.updated_at FROM karven_memberships m JOIN karven_workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.created_at',
      [req.auth.userId]
    )).rows
  }));

  app.post('/api/v1/workspaces', { preHandler: requireAuth }, async (req,reply) => {
    const parsed=workspaceSchema.safeParse(req.body);
    if(!parsed.success) return reply.code(400).send({error:'validation_error'});
    const workspace=await tx(async client=>{
      const row=(await client.query(
        'INSERT INTO karven_workspaces(name,slug,created_by) VALUES($1,$2,$3) RETURNING *',
        [parsed.data.name,slugify(parsed.data.name),req.auth.userId]
      )).rows[0];
      await client.query('INSERT INTO karven_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)',[row.id,req.auth.userId,'owner']);
      return row;
    });
    await audit({workspaceId:workspace.id,userId:req.auth.userId,action:'create',entityType:'workspace',entityId:workspace.id});
    return reply.code(201).send(workspace);
  });

  app.get('/api/v1/workspaces/:workspaceId/members',{preHandler:[requireAuth,requireWorkspaceRole('viewer')]},async req=>({
    items:(await query(
      'SELECT u.id,u.email,u.full_name,m.role,m.created_at FROM karven_memberships m JOIN karven_users u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY m.created_at',
      [req.params.workspaceId]
    )).rows
  }));

  app.post('/api/v1/workspaces/:workspaceId/invites',{preHandler:[requireAuth,requireWorkspaceRole('admin')]},async(req,reply)=>{
    const parsed=memberSchema.safeParse(req.body);
    if(!parsed.success) return reply.code(400).send({error:'validation_error'});
    const token=newOpaqueToken();
    const invite=(await query(
      'INSERT INTO karven_invites(workspace_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval \'7 days\') RETURNING id,email,role,expires_at',
      [req.params.workspaceId,parsed.data.email,parsed.data.role,hashToken(token),req.auth.userId]
    )).rows[0];
    try{
      await enqueue('email.send',{to:invite.email,subject:'You are invited to KARVEN',text:`Invitation token: ${token}`});
    }catch{}
    await audit({workspaceId:req.params.workspaceId,userId:req.auth.userId,action:'invite',entityType:'membership',entityId:invite.id,payload:{email:invite.email,role:invite.role}});
    return reply.code(201).send(invite);
  });

  app.post('/api/v1/invites/accept',{preHandler:requireAuth},async(req,reply)=>{
    const token=String(req.body?.token||'');
    if(token.length<40) return reply.code(400).send({error:'validation_error'});
    const result=await tx(async client=>{
      const invite=await client.query(
        'SELECT * FROM karven_invites WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE',
        [hashToken(token)]
      );
      if(!invite.rowCount) return null;
      const row=invite.rows[0];
      if(String(row.email).toLowerCase()!==String(req.auth.email).toLowerCase()) return {emailMismatch:true};
      await client.query(
        'INSERT INTO karven_memberships(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role',
        [row.workspace_id,req.auth.userId,row.role]
      );
      await client.query('UPDATE karven_invites SET accepted_at=now() WHERE id=$1',[row.id]);
      return row;
    });
    if(!result) return reply.code(400).send({error:'invite_invalid'});
    if(result.emailMismatch) return reply.code(403).send({error:'invite_email_mismatch'});
    await emitOutbox({workspaceId:result.workspace_id,eventType:'membership.created',aggregateType:'membership',aggregateId:req.auth.userId,payload:{role:result.role}});
    return {ok:true,workspaceId:result.workspace_id};
  });

  app.patch('/api/v1/workspaces/:workspaceId/members/:userId',{preHandler:[requireAuth,requireWorkspaceRole('owner')]},async(req,reply)=>{
    const role=String(req.body?.role||'');
    if(!['owner','admin','manager','member','viewer'].includes(role)) return reply.code(400).send({error:'invalid_role'});
    const result=await query('UPDATE karven_memberships SET role=$3 WHERE workspace_id=$1 AND user_id=$2 RETURNING workspace_id,user_id,role',[req.params.workspaceId,req.params.userId,role]);
    if(!result.rowCount) return reply.code(404).send({error:'not_found'});
    return result.rows[0];
  });
}
