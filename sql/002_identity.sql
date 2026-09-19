CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS karven_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS karven_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES karven_users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_sessions_user_idx ON karven_sessions(user_id);
CREATE INDEX IF NOT EXISTS karven_sessions_expiry_idx ON karven_sessions(expires_at);

CREATE TABLE IF NOT EXISTS karven_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES karven_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS karven_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_by uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS karven_memberships (
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES karven_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','manager','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,user_id)
);
CREATE INDEX IF NOT EXISTS karven_memberships_user_idx ON karven_memberships(user_id);

CREATE TABLE IF NOT EXISTS karven_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  email citext NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','manager','member','viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_invites_workspace_idx ON karven_invites(workspace_id);
