-- Add the dedicated finance role without changing existing owner privileges.
-- Finance users can work with accounting records; journal posting and configuration
-- remain owner-only in the application authorization layer.
INSERT INTO roles (organization_id, code, name, description, is_system)
SELECT o.id, 'FINANCE', 'Keuangan', 'Akses operasional modul keuangan dan akuntansi; tidak termasuk posting jurnal atau konfigurasi sistem.', true
FROM organizations o
WHERE o.is_active = true
  AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.organization_id = o.id AND r.code = 'FINANCE');

