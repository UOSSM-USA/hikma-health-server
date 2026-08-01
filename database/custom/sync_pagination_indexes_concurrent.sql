-- OPTIONAL. Not part of the deploy path. Nobody needs to run this.
--
-- The 20260801_add_sync_pagination_indexes migration creates these same indexes
-- and is self-contained: a normal deploy needs no extra step. It uses plain
-- CREATE INDEX, which holds a SHARE lock — reads continue, writes to each table
-- pause while its index builds. On the database sizes most instances run, that
-- is seconds.
--
-- This file exists for the rare operator whose tables are large enough that the
-- write pause matters. Running it beforehand builds the same indexes
-- CONCURRENTLY, without pausing writes; the migration's IF NOT EXISTS
-- statements then find them and do nothing. Skipping it is fine and is the
-- expected case.
--
-- CONCURRENTLY cannot live in the migration itself: kysely-ctl wraps every
-- migration in a transaction, Postgres rejects CREATE INDEX CONCURRENTLY there,
-- and issuing it on a second connection hangs because CONCURRENTLY waits for
-- the migrator's still-open transaction.
--
-- Run with psql, NOT inside a transaction, and not via a tool that opens one:
--   psql "$DATABASE_URL" -f database/custom/sync_pagination_indexes_concurrent.sql
--
-- Safe to re-run. A CONCURRENTLY build that fails partway leaves an INVALID
-- index behind; IF NOT EXISTS will then skip it rather than repair it, so check
-- for invalid indexes afterwards with the query at the bottom of this file and
-- DROP any it reports before re-running.

CREATE INDEX CONCURRENTLY IF NOT EXISTS events_sync_created_idx ON events (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS events_sync_modified_idx ON events (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS events_sync_deleted_idx ON events (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS patients_sync_created_idx ON patients (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patients_sync_modified_idx ON patients (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patients_sync_deleted_idx ON patients (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS visits_sync_created_idx ON visits (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS visits_sync_modified_idx ON visits (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS visits_sync_deleted_idx ON visits (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS prescriptions_sync_created_idx ON prescriptions (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS prescriptions_sync_modified_idx ON prescriptions (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS prescriptions_sync_deleted_idx ON prescriptions (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_vitals_sync_created_idx ON patient_vitals (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_vitals_sync_modified_idx ON patient_vitals (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_vitals_sync_deleted_idx ON patient_vitals (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_problems_sync_created_idx ON patient_problems (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_problems_sync_modified_idx ON patient_problems (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_problems_sync_deleted_idx ON patient_problems (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_sync_created_idx ON appointments (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_sync_modified_idx ON appointments (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_sync_deleted_idx ON appointments (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_additional_attributes_sync_created_idx ON patient_additional_attributes (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_additional_attributes_sync_modified_idx ON patient_additional_attributes (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_additional_attributes_sync_deleted_idx ON patient_additional_attributes (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS prescription_items_sync_created_idx ON prescription_items (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS prescription_items_sync_modified_idx ON prescription_items (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS prescription_items_sync_deleted_idx ON prescription_items (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS dispensing_records_sync_created_idx ON dispensing_records (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS dispensing_records_sync_modified_idx ON dispensing_records (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS dispensing_records_sync_deleted_idx ON dispensing_records (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS clinic_departments_sync_created_idx ON clinic_departments (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS clinic_departments_sync_modified_idx ON clinic_departments (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS clinic_departments_sync_deleted_idx ON clinic_departments (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS drug_catalogue_sync_created_idx ON drug_catalogue (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS drug_catalogue_sync_modified_idx ON drug_catalogue (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS drug_catalogue_sync_deleted_idx ON drug_catalogue (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS clinic_inventory_sync_created_idx ON clinic_inventory (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS clinic_inventory_sync_modified_idx ON clinic_inventory (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS clinic_inventory_sync_deleted_idx ON clinic_inventory (deleted_at, id) WHERE is_deleted = true;

-- The reference tables 20260801 missed and 20260806 adds. Small enough that a
-- plain build pauses writes for well under a second, so pre-building these
-- matters even less than the rest of this file — included for completeness, so
-- the two migrations together have no statement without a CONCURRENTLY twin.
--
-- devices and device_pin_codes are only ever walked for a sync_hub peer.

CREATE INDEX CONCURRENTLY IF NOT EXISTS clinics_sync_created_idx ON clinics (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS clinics_sync_modified_idx ON clinics (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS clinics_sync_deleted_idx ON clinics (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS event_forms_sync_created_idx ON event_forms (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS event_forms_sync_modified_idx ON event_forms (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS event_forms_sync_deleted_idx ON event_forms (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_registration_forms_sync_created_idx ON patient_registration_forms (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_registration_forms_sync_modified_idx ON patient_registration_forms (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS patient_registration_forms_sync_deleted_idx ON patient_registration_forms (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS users_sync_created_idx ON users (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_sync_modified_idx ON users (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_sync_deleted_idx ON users (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS devices_sync_created_idx ON devices (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS devices_sync_modified_idx ON devices (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS devices_sync_deleted_idx ON devices (deleted_at, id) WHERE is_deleted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS device_pin_codes_sync_created_idx ON device_pin_codes (server_created_at, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS device_pin_codes_sync_modified_idx ON device_pin_codes (last_modified, id) WHERE deleted_at IS NULL AND is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS device_pin_codes_sync_deleted_idx ON device_pin_codes (deleted_at, id) WHERE is_deleted = true;

-- Post-run check. Any row returned is an index whose CONCURRENTLY build failed;
-- it is unusable by the planner and IF NOT EXISTS will not rebuild it. DROP
-- INDEX CONCURRENTLY each one, then re-run this script.
--
--   SELECT i.indexrelid::regclass AS invalid_index
--   FROM pg_index i
--   WHERE NOT i.indisvalid
--     AND i.indexrelid::regclass::text LIKE '%_sync_%_idx';
