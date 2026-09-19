import { query } from './db.js';
import { verifyAccessToken, safeEqualText } from './security.js';
import { config } from './config.js';

export async function requireAuth(req, reply) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return reply.code(401).send({ error: 'unauthorized' });
  try {
    const payload = await verifyAccessToken(header.slice(7));
    const session = await query(
      'SELECT s.id,s.user_id,u.email,u.full_name,u.status FROM karven_sessions s JOIN karven_users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()',
      [payload.sid, payload.sub]
    );
    if (!session.rowCount || session.rows[0].status !== 'active') {
      return reply.code(401).send({ error: 'session_invalid' });
    }
    req.auth = {
      userId: session.rows[0].user_id,
      sessionId: session.rows[0].id,
      email: session.rows[0].email,
      fullName: session.rows[0].full_name
    };
  } catch {
    return reply.code(401).send({ error: 'token_invalid' });
  }
}

export async function requirePlatformAdmin(req, reply) {
  const token = req.headers['x-karven-admin-key'] || '';
  if (!config.adminApiKey || !safeEqualText(token, config.adminApiKey)) {
    return reply.code(401).send({ error: 'platform_admin_required' });
  }
}

const rank = { viewer: 10, member: 20, manager: 30, admin: 40, owner: 50 };

export function requireWorkspaceRole(minRole = 'viewer') {
  return async function workspaceRole(req, reply) {
    if (!req.auth) {
      await requireAuth(req, reply);
      if (reply.sent) return;
    }
    const workspaceId = req.params?.workspaceId;
    if (!workspaceId) return reply.code(400).send({ error: 'workspace_required' });
    const result = await query(
      'SELECT role FROM karven_memberships WHERE workspace_id=$1 AND user_id=$2',
      [workspaceId, req.auth.userId]
    );
    if (!result.rowCount || rank[result.rows[0].role] < rank[minRole]) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    req.workspace = { id: workspaceId, role: result.rows[0].role };
  };
}
