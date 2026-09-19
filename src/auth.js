import crypto from 'node:crypto';

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export async function requireAdmin(req, reply) {
  const configured = process.env.KARVEN_ADMIN_API_KEY;
  if (!configured) {
    return reply.code(503).send({ error: 'admin_auth_not_configured' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : req.headers['x-karven-admin-key'];

  if (!safeEqual(token, configured)) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}
