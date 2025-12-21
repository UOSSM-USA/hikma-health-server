# Database Migration Guide

## Overview

This project uses Kysely for database migrations. Migrations are automatically run during deployment, but can also be run manually for local development.

## Migration Commands

### Local Development

**Run migrations manually:**
```bash
pnpm run db:migrate
```

This runs: `npx dotenv -e .env -- npx kysely migrate latest`

**Run dev server with migrations:**
```bash
pnpm run dev:with-migrations
```

This will run migrations before starting the dev server.

**Start production server (includes migrations):**
```bash
pnpm run start
```

This runs migrations automatically before starting the server.

### Staging/Production Deployment

Migrations are **automatically run** during deployment via the `start` script:

1. **Render Deployment**: When deploying to Render (staging or production), the `start` command is executed, which includes:
   ```bash
   pnpm run db:migrate && pnpm run recovery:permissions && pnpm run start-only
   ```

2. **GitHub Actions**: The deployment workflows (`.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml`) trigger Render deployments, which automatically run migrations.

## Migration Files

- **Location**: `db/migrations/`
- **Naming**: `YYYYMMDD_description.ts`
- **Format**: Each migration exports `up()` and `down()` functions

## Current Migration Status

To check which migrations have been run:

```bash
# Connect to your database and check the alembic_version table
psql $DATABASE_URL -c "SELECT * FROM alembic_version;"
```

## Troubleshooting

### Migration Fails During Deployment

1. Check Render logs for migration errors
2. Verify database connection string is correct
3. Ensure database user has CREATE TABLE permissions
4. Check for migration conflicts (duplicate migration names)

### Forms Not Showing in Clinic Edit Page

If you see "No event forms available" when editing a clinic:

1. **Check if migration has been run:**
   ```bash
   pnpm run db:migrate
   ```

2. **Verify the `clinic_event_forms` table exists:**
   ```bash
   psql $DATABASE_URL -c "\d clinic_event_forms"
   ```

3. **Check browser console** for errors loading forms

4. **Verify you're logged in as a super admin** (only super admins can see/assign forms)

5. **Check server logs** for errors when loading forms

### Manual Migration Rollback

If you need to rollback a migration:

```bash
# Rollback to a specific migration (not commonly used)
npx kysely migrate down
```

**Note**: Be very careful with rollbacks in production!

## Adding New Migrations

1. Create a new file in `db/migrations/` with format: `YYYYMMDD_description.ts`
2. Export `up()` and `down()` functions
3. Test locally: `pnpm run db:migrate`
4. Commit and push - migrations will run automatically on deployment

## Example Migration

```typescript
import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("example_table")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("example_table").execute();
}
```
