-- Public self-registration requests never grant operational access.
CREATE TABLE IF NOT EXISTS access_role_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
 requested_role text NOT NULL CHECK(requested_role IN ('ADMIN','FINANCE','GUDANG','SALES','PRODUKSI','QUALITY','DISTRIBUSI','PELANGGAN','MITRA')),
 reason text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 reviewed_by uuid REFERENCES user_profiles(id),
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS access_role_requests_one_pending_per_user ON access_role_requests(user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS access_role_requests_org_status_created ON access_role_requests(organization_id,status,created_at DESC);
