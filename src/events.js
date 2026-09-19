import { query } from './db.js';

export async function audit({ workspaceId = null, userId = null, action, entityType, entityId = null, payload = {} }) {
  await query(
    'INSERT INTO karven_audit_v2(workspace_id,user_id,action,entity_type,entity_id,payload) VALUES($1,$2,$3,$4,$5,$6)',
    [workspaceId, userId, action, entityType, entityId, payload]
  );
}

export async function emitOutbox({ workspaceId = null, eventType, aggregateType, aggregateId = null, payload = {} }) {
  await query(
    'INSERT INTO karven_outbox(workspace_id,event_type,aggregate_type,aggregate_id,payload) VALUES($1,$2,$3,$4,$5)',
    [workspaceId, eventType, aggregateType, aggregateId, payload]
  );
}
