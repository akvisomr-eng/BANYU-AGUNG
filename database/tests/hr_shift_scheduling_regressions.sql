-- Regression tests for tenant-safe HR shift templates and assignments.
\set ON_ERROR_STOP on

DO $$
DECLARE
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  employee_a uuid := gen_random_uuid();
  employee_b uuid := gen_random_uuid();
  shift_a uuid := gen_random_uuid();
  shift_b uuid := gen_random_uuid();
  assignment_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO organizations (id, legal_name, trade_name)
  VALUES (org_a, 'HR Shift Test A', 'HR Shift Test A'),
         (org_b, 'HR Shift Test B', 'HR Shift Test B');

  INSERT INTO employees (id, organization_id, employee_number, full_name)
  VALUES (employee_a, org_a, 'HR-SHIFT-A', 'Employee A'),
         (employee_b, org_b, 'HR-SHIFT-B', 'Employee B');

  -- Overnight shift definitions are valid and retained as local wall-clock times.
  INSERT INTO hr_shift_templates
    (id, organization_id, code, name, start_time, end_time, break_minutes, grace_minutes)
  VALUES
    (shift_a, org_a, 'NIGHT', 'Night Shift', TIME '22:00', TIME '06:00', 60, 10),
    (shift_b, org_b, 'DAY', 'Day Shift', TIME '08:00', TIME '16:00', 60, 5);

  INSERT INTO hr_employee_shift_assignments
    (id, organization_id, employee_id, shift_template_id, effective_from, effective_to)
  VALUES
    (assignment_id, org_a, employee_a, shift_a, DATE '2026-11-01', DATE '2026-11-30');

  -- Same employee cannot have overlapping effective periods.
  BEGIN
    INSERT INTO hr_employee_shift_assignments
      (organization_id, employee_id, shift_template_id, effective_from, effective_to)
    VALUES
      (org_a, employee_a, shift_a, DATE '2026-11-15', DATE '2026-12-15');
    RAISE EXCEPTION 'Overlapping employee shift assignment was unexpectedly accepted';
  EXCEPTION WHEN exclusion_violation THEN
    IF SQLERRM NOT LIKE '%HR_SHIFT_ASSIGNMENT_OVERLAP%' THEN RAISE; END IF;
  END;

  -- Composite tenant foreign keys reject assigning another organization's shift.
  BEGIN
    INSERT INTO hr_employee_shift_assignments
      (organization_id, employee_id, shift_template_id, effective_from)
    VALUES
      (org_a, employee_a, shift_b, DATE '2026-12-01');
    RAISE EXCEPTION 'Cross-organization shift assignment was unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- Employee identity must also belong to the stated organization.
  BEGIN
    INSERT INTO hr_employee_shift_assignments
      (organization_id, employee_id, shift_template_id, effective_from)
    VALUES
      (org_a, employee_b, shift_a, DATE '2026-12-01');
    RAISE EXCEPTION 'Cross-organization employee assignment was unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM hr_employee_shift_assignments
    WHERE id = assignment_id AND organization_id = org_a
      AND employee_id = employee_a AND shift_template_id = shift_a
  ) THEN
    RAISE EXCEPTION 'Valid HR shift assignment was not persisted';
  END IF;
END $$;
