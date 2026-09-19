import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { query, pool } from './db.js';
import { redis, ensureRedis } from './redis.js';
import { requireAdmin } from './auth.js';
import { recordSchema, settingsSchema, kinds } from './schema.js';

if (!process.env.KARVEN_ADMIN_API_KEY) {
  throw new Error('KARVEN_ADMIN_API_KEY is required');
}

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 1024 * 1024
});

const origins = (process.env.KARVEN_ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, {
  origin: origins.length ? origins : false,
  credentials: true
});
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  timeWindow: '1 minute'
});

async function audit(action, entityType, entityId = null, payload = {}) {
  await query(
    'INSERT INTO karven_audit(action,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)',
    [action, entityType, entityId, payload]
  );
}

function idOk(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function dependencyState() {
  let database = 'down';
  let cache = redis ? 'down' : 'disabled';

  try {
    await query('SELECT 1');
    database = 'ok';
  } catch {}

  if (redis) {
    try {
      await ensureRedis();
      await redis.ping();
      cache = 'ok';
    } catch {}
  }

  return {
    database,
    redis: cache,
    ok: database === 'ok' && cache !== 'down'
  };
}

app.get('/', async () => ({
  service: 'KARVEN Backend',
  status: 'ok',
  version: '1.0.0'
}));

app.get('/health', async () => {
  const deps = await dependencyState();
  return {
    service: 'KARVEN Backend',
    status: deps.ok ? 'ok' : 'degraded',
    version: '1.0.0',
    database: deps.database,
    redis: deps.redis,
    modules: ['customers','team','content','navigation','legal','plans','discounts','payments','settings','audit']
  };
});

app.get('/ready', async (_req, reply) => {
  const deps = await dependencyState();
  const payload = {
    service: 'KARVEN Backend',
    status: deps.ok ? 'ready' : 'not_ready',
    database: deps.database,
    redis: deps.redis
  };
  return reply.code(deps.ok ? 200 : 503).send(payload);
});

app.get('/api/public/storefront', async () => {
  const [settings, content, navigation, plans] = await Promise.all([
    query('SELECT data FROM karven_settings WHERE id=1'),
    query("SELECT id,title,tag,description,status,metadata,updated_at FROM karven_records WHERE kind='content' AND status='published' ORDER BY updated_at DESC LIMIT 100"),
    query("SELECT id,title,tag,description,status,metadata,updated_at FROM karven_records WHERE kind='navigation' AND status='published' ORDER BY updated_at DESC LIMIT 100"),
    query("SELECT id,title,tag,description,status,metadata,updated_at FROM karven_records WHERE kind='plan' AND status='active' ORDER BY updated_at DESC LIMIT 100")
  ]);

  return {
    brand: 'KARVEN',
    settings: settings.rows[0]?.data || {},
    content: content.rows,
    navigation: navigation.rows,
    plans: plans.rows
  };
});

app.get('/api/admin/records', { preHandler: requireAdmin }, async req => {
  const kind = req.query?.kind;
  const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 500);
  const offset = Math.max(Number(req.query?.offset || 0), 0);

  const params = [];
  let where = '';

  if (kind && kinds.includes(kind)) {
    params.push(kind);
    where = 'WHERE kind=$1';
  }

  params.push(limit, offset);
  const base = params.length === 3 ? 2 : 1;

  const result = await query(
    `SELECT * FROM karven_records ${where} ORDER BY updated_at DESC LIMIT $${base} OFFSET $${base + 1}`,
    params
  );

  return { items: result.rows, limit, offset };
});

app.post('/api/admin/records', { preHandler: requireAdmin }, async (req, reply) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten() });
  }

  const value = parsed.data;
  const result = await query(
    'INSERT INTO karven_records(kind,title,tag,description,status,metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [value.kind, value.title, value.tag, value.description, value.status, value.metadata]
  );

  await audit('create', 'record', result.rows[0].id, { kind: value.kind });
  return reply.code(201).send(result.rows[0]);
});

app.patch('/api/admin/records/:id', { preHandler: requireAdmin }, async (req, reply) => {
  if (!idOk(req.params.id)) return reply.code(400).send({ error: 'invalid_id' });

  const parsed = recordSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten() });
  }

  const current = await query('SELECT * FROM karven_records WHERE id=$1', [req.params.id]);
  if (!current.rowCount) return reply.code(404).send({ error: 'not_found' });

  const next = { ...current.rows[0], ...parsed.data };
  const result = await query(
    'UPDATE karven_records SET kind=$2,title=$3,tag=$4,description=$5,status=$6,metadata=$7,updated_at=now() WHERE id=$1 RETURNING *',
    [req.params.id, next.kind, next.title, next.tag, next.description, next.status, next.metadata]
  );

  await audit('update', 'record', req.params.id, { kind: next.kind });
  return result.rows[0];
});

app.delete('/api/admin/records/:id', { preHandler: requireAdmin }, async (req, reply) => {
  if (!idOk(req.params.id)) return reply.code(400).send({ error: 'invalid_id' });

  const result = await query(
    'DELETE FROM karven_records WHERE id=$1 RETURNING id,kind',
    [req.params.id]
  );

  if (!result.rowCount) return reply.code(404).send({ error: 'not_found' });

  await audit('delete', 'record', req.params.id, { kind: result.rows[0].kind });
  return { deleted: true, id: req.params.id };
});

app.get('/api/admin/settings', { preHandler: requireAdmin }, async () => {
  return (await query('SELECT data,updated_at FROM karven_settings WHERE id=1')).rows[0];
});

app.put('/api/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten() });
  }

  const result = await query(
    'UPDATE karven_settings SET data=$1,updated_at=now() WHERE id=1 RETURNING data,updated_at',
    [parsed.data]
  );

  await audit('update', 'settings', '1', {});
  return result.rows[0];
});

app.get('/api/admin/audit', { preHandler: requireAdmin }, async req => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 500);
  return {
    items: (await query(
      'SELECT * FROM karven_audit ORDER BY created_at DESC LIMIT $1',
      [limit]
    )).rows
  };
});

app.get('/api/admin/health', { preHandler: requireAdmin }, async () => {
  const deps = await dependencyState();
  return {
    service: 'KARVEN Backend',
    status: deps.ok ? 'ok' : 'degraded',
    brand: 'KARVEN',
    database: deps.database,
    redis: deps.redis,
    modules: ['customers','team','content','navigation','legal','plans','discounts','payments','settings','audit']
  };
});

app.setNotFoundHandler((_req, reply) => {
  reply.code(404).send({ error: 'not_found' });
});

app.setErrorHandler((error, req, reply) => {
  req.log.error(error);
  const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  reply.code(statusCode).send({
    error: statusCode >= 500 ? 'internal_error' : error.name || 'request_error'
  });
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const shutdown = async signal => {
  app.log.info({ signal }, 'shutdown');
  try { await app.close(); } catch {}
  try { await pool.end(); } catch {}
  try { if (redis) redis.disconnect(); } catch {}
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ port, host });
