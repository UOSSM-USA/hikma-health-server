-- Add optional country and city columns to the clinics table.
-- The address column already exists (see V20260101__create_initial_tables.sql).
-- Nullable with no default, so unset values store NULL.
ALTER TABLE clinics ADD COLUMN country TEXT;
ALTER TABLE clinics ADD COLUMN city TEXT;
