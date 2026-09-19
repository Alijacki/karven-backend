CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS karven_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('customer','team','content','navigation','legal','plan','discount','payment')),
  title text NOT NULL,
  tag text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','draft','published','pending','paid','failed','expired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS karven_records_kind_idx ON karven_records(kind);
CREATE INDEX IF NOT EXISTS karven_records_status_idx ON karven_records(status);
CREATE INDEX IF NOT EXISTS karven_records_updated_idx ON karven_records(updated_at DESC);

CREATE TABLE IF NOT EXISTS karven_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL DEFAULT '{"brandName":"KARVEN","supportEmail":"","announcement":"","maintenanceMode":false,"registrationsEnabled":true,"paymentsEnabled":true,"defaultCurrency":"USD"}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO karven_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS karven_audit (
  id bigserial PRIMARY KEY,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS karven_audit_created_idx ON karven_audit(created_at DESC);
