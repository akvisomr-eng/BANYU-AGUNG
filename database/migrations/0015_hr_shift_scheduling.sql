-- HR shift patterns and effective-dated employee assignments.
-- Safe additive migration: no existing attendance rows are rewritten.
CREATE TABLE IF NOT EXISTS hr_shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 480),
  grace_minutes integer NOT NULL DEFAULT 0 CHECK (grace_minutes BETWEEN 0 AND 240),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_shift_templates_org_code_key UNIQUE (organization_id, code),
  CONSTRAINT hr_shift_templates_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT hr_shift_templates_name_check CHECK (length(trim(name)) BETWEEN 2 AND 120),
  CONSTRAINT hr_shift_templates_code_check CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{1,29}$')
);

CREATE TABLE IF NOT EXISTS hr_employee_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL,
  shift_template_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_shift_assignment_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT hr_shift_assignment_employee_org_fk
    FOREIGN KEY (employee_id, organization_id) REFERENCES employees(id, organization_id),
  CONSTRAINT hr_shift_assignment_template_org_fk
    FOREIGN KEY (shift_template_id, organization_id) REFERENCES hr_shift_templates(id, organization_id)
);

CREATE INDEX IF NOT EXISTS hr_shift_assignments_employee_dates_idx
  ON hr_employee_shift_assignments (organization_id, employee_id, effective_from DESC, effective_to);
CREATE INDEX IF NOT EXISTS hr_shift_templates_org_active_idx
  ON hr_shift_templates (organization_id, is_active, name);

-- Serialize assignments per employee and reject overlapping effective periods.
CREATE OR REPLACE FUNCTION enforce_hr_shift_assignment_no_overlap()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.employee_id::text, 0));
  IF EXISTS (
    SELECT 1
    FROM hr_employee_shift_assignments a
    WHERE a.employee_id = NEW.employee_id
      AND a.organization_id = NEW.organization_id
      AND a.id <> NEW.id
      AND daterange(a.effective_from, a.effective_to, '[]')
          && daterange(NEW.effective_from, NEW.effective_to, '[]')
  ) THEN
    RAISE EXCEPTION 'HR_SHIFT_ASSIGNMENT_OVERLAP'
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hr_shift_assignment_no_overlap ON hr_employee_shift_assignments;
CREATE TRIGGER hr_shift_assignment_no_overlap
BEFORE INSERT OR UPDATE OF employee_id, organization_id, effective_from, effective_to
ON hr_employee_shift_assignments
FOR EACH ROW EXECUTE FUNCTION enforce_hr_shift_assignment_no_overlap();

COMMENT ON TABLE hr_shift_templates IS 'Reusable HR work shift patterns; end_time earlier than start_time represents an overnight shift.';
COMMENT ON TABLE hr_employee_shift_assignments IS 'Effective-dated employee shift history; overlapping periods are rejected transactionally.';
