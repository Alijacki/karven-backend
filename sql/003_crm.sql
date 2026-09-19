CREATE TABLE IF NOT EXISTS karven_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text NOT NULL DEFAULT '',
  email citext,
  phone text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  owner_user_id uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_companies_workspace_idx ON karven_companies(workspace_id);
CREATE INDEX IF NOT EXISTS karven_companies_name_idx ON karven_companies(workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS karven_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  company_id uuid REFERENCES karven_companies(id) ON DELETE SET NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email citext,
  phone text NOT NULL DEFAULT '',
  job_title text NOT NULL DEFAULT '',
  owner_user_id uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_contacts_workspace_idx ON karven_contacts(workspace_id);
CREATE INDEX IF NOT EXISTS karven_contacts_email_idx ON karven_contacts(workspace_id,email);

CREATE TABLE IF NOT EXISTS karven_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_pipelines_workspace_idx ON karven_pipelines(workspace_id);

CREATE TABLE IF NOT EXISTS karven_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES karven_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  probability integer NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_stages_pipeline_idx ON karven_pipeline_stages(pipeline_id,position);

CREATE TABLE IF NOT EXISTS karven_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES karven_pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES karven_pipeline_stages(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES karven_contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES karven_companies(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  probability integer NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  expected_close_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_opportunities_workspace_idx ON karven_opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS karven_opportunities_stage_idx ON karven_opportunities(workspace_id,stage_id);

CREATE TABLE IF NOT EXISTS karven_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at timestamptz,
  assignee_user_id uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  linked_type text,
  linked_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_tasks_workspace_idx ON karven_tasks(workspace_id,status,due_at);

CREATE TABLE IF NOT EXISTS karven_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  body text NOT NULL,
  linked_type text,
  linked_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_notes_link_idx ON karven_notes(workspace_id,linked_type,linked_id);

CREATE TABLE IF NOT EXISTS karven_activities (
  id bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES karven_users(id) ON DELETE SET NULL,
  type text NOT NULL,
  subject_type text,
  subject_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS karven_activities_workspace_idx ON karven_activities(workspace_id,created_at DESC);

CREATE TABLE IF NOT EXISTS karven_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES karven_workspaces(id) ON DELETE CASCADE,
  object_type text NOT NULL CHECK (object_type IN ('contact','company','opportunity','task')),
  key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','number','boolean','date','select','multi_select','json')),
  required boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,object_type,key)
);

CREATE TABLE IF NOT EXISTS karven_custom_values (
  field_id uuid NOT NULL REFERENCES karven_custom_fields(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(field_id,object_id)
);
