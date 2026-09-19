import { tx, query } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, newOpaqueToken, hashToken, signAccessToken } from '../security.js';
import { requireAuth } from '../auth.js';
import { registerSchema, loginSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema } from '../schema.js';
import { enqueue } from '../queue.js';
import { audit, emitOutbox } from '../events.js';

function slugify(value) {
  const base = String(value || 'workspace').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'workspace';
  return `${base}-${newOpaqueToken(5).toLowerCase()}`;
}

function expiryDate() {
  return new Date(Date.now() + config.refreshTokenDays * 86400000);
}

async function createSession(client, user, req) {
  const refreshToken = newOpaqueToken();
  const session = await client.query(
    'INSERT INTO karven_sessions(user_id,refresh_token_hash,expires_at,user_agent,ip) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [user.id, hashToken(refreshToken), expiryDate(), String(req.headers['user-agent'] || '').slice(0,1000), req.ip || '']
  );
  const accessToken = await signAccessToken({ userId: user.id, sessionId: session.rows[0].id });
  return { accessToken, refreshToken, expiresInSeconds: config.accessTokenMinutes * 60 };
}

export default async function authRoutes(app) {
  app.post('/api/v1/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error:'validation_error', details: parsed.error.flatten() });
    const v = parsed.data;
    const result = await tx(async client => {
      const exists = await client.query('SELECT 1 FROM karven_users WHERE email=$1', [v.email]);
      if (exists.rowCount) return { conflict: true };
      const passwordHash = await hashPassword(v.password);
      const user = (await client.query(
        'INSERT INTO karven_users(email,password_hash,full_name) VALUES($1,$2,$3) RETURNING id,email,full_name,status',
        [v.email,passwordHash,v.fullName]
      )).rows[0];
      const workspace = (await client.query(
        'INSERT INTO karven_workspaces(name,slug,created_by) VALUES($1,$2,$3) RETURNING id,name,slug,status',
        [v.workspaceName,slugify(v.workspaceName),user.id]
      )).rows[0];
      await client.query('INSERT INTO karven_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)', [workspace.id,user.id,'owner']);
      const session = await createSession(client,user,req);
      return { user, workspace, session };
    });
    if (result.conflict) return reply.code(409).send({ error:'email_in_use' });
    await audit({ workspaceId:result.workspace.id,userId:result.user.id,action:'register',entityType:'user',entityId:result.user.id });
    await emitOutbox({ workspaceId:result.workspace.id,eventType:'workspace.created',aggregateType:'workspace',aggregateId:result.workspace.id,payload:{name:result.workspace.name} });
    return reply.code(201).send(result);
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error:'validation_error' });
    const userResult = await query('SELECT id,email,full_name,status,password_hash FROM karven_users WHERE email=$1', [parsed.data.email]);
    const user = userResult.rows[0];
    if (!user || user.status !== 'active' || !(await verifyPassword(parsed.data.password,user.password_hash))) {
      return reply.code(401).send({ error:'invalid_credentials' });
    }
    const session = await tx(client => createSession(client,user,req));
    return { user:{id:user.id,email:user.email,fullName:user.full_name}, session };
  });

  app.post('/api/v1/auth/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error:'validation_error' });
    const oldHash = hashToken(parsed.data.refreshToken);
    const result = await tx(async client => {
      const found = await client.query(
        'SELECT s.id,s.user_id,u.email,u.full_name,u.status FROM karven_sessions s JOIN karven_users u ON u.id=s.user_id WHERE s.refresh_token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() FOR UPDATE',
        [oldHash]
      );
      if (!found.rowCount || found.rows[0].status !== 'active') return null;
      const row = found.rows[0];
      const refreshToken = newOpaqueToken();
      await client.query('UPDATE karven_sessions SET refresh_token_hash=$2,expires_at=$3 WHERE id=$1', [row.id,hashToken(refreshToken),expiryDate()]);
      const accessToken = await signAccessToken({userId:row.user_id,sessionId:row.id});
      return { accessToken,refreshToken,expiresInSeconds:config.accessTokenMinutes*60 };
    });
    if (!result) return reply.code(401).send({ error:'refresh_invalid' });
    return result;
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error:'validation_error' });
    await query('UPDATE karven_sessions SET revoked_at=now() WHERE refresh_token_hash=$1', [hashToken(parsed.data.refreshToken)]);
    return { ok:true };
  });

  app.post('/api/v1/auth/forgot-password', async (req, reply) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error:'validation_error' });
    const user = (await query('SELECT id,email FROM karven_users WHERE email=$1 AND status=$2', [parsed.data.email,'active'])).rows[0];
    if (user) {
      const token = newOpaqueToken();
      await query(
        'INSERT INTO karven_password_resets(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'1 hour\')',
        [user.id,hashToken(token)]
      );
      const link = config.appUrl ? `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}` : token;
      try {
        await enqueue('email.send',{to:user.email,subject:'Reset your KARVEN password',text:`Reset your KARVEN password: ${link}`});
      } catch {}
    }
    return reply.code(202).send({ ok:true });
  });

  app.post('/api/v1/auth/reset-password', async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error:'validation_error' });
    const ok = await tx(async client => {
      const reset = await client.query(
        'SELECT id,user_id FROM karven_password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',
        [hashToken(parsed.data.token)]
      );
      if (!reset.rowCount) return false;
      const passwordHash = await hashPassword(parsed.data.password);
      await client.query('UPDATE karven_users SET password_hash=$2,updated_at=now() WHERE id=$1', [reset.rows[0].user_id,passwordHash]);
      await client.query('UPDATE karven_password_resets SET used_at=now() WHERE id=$1', [reset.rows[0].id]);
      await client.query('UPDATE karven_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [reset.rows[0].user_id]);
      return true;
    });
    if (!ok) return reply.code(400).send({ error:'reset_invalid' });
    return { ok:true };
  });

  app.get('/api/v1/me', { preHandler: requireAuth }, async req => {
    const workspaces = await query(
      'SELECT w.id,w.name,w.slug,w.status,m.role FROM karven_memberships m JOIN karven_workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.created_at',
      [req.auth.userId]
    );
    return { user:req.auth, workspaces:workspaces.rows };
  });
}
