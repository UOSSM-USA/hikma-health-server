# Hikma EHR - Git, CI/CD, Environments, and Operations

## Executive Summary

This document consolidates the complete Git strategy, protected-branch rules, CI/CD requirements, developer workflow, environment configuration, database practices, monitoring, security, and runbook procedures for the Hikma EHR system. It ensures production stability, safe validation in staging, and efficient collaboration.

- **Production stability**: Only reviewed, tested code reaches `main`, with automated checks and monitored deploys to Render Production.
- **Safe staging**: `develop` deploys to Render Staging for validation with anonymized data, no PHI.
- **Contributor workflow**: Feature branches with pull requests, code review, and conventional commits.
- **Auditability & compliance**: Tagged releases, structured logs, security scans, and backups.

---

## Branching Strategy

```
main (production)
├── develop (staging)
│   ├── feature/<short-description>
│   └── ...
└── hotfix/<issue>
(Optionally) release/vX.Y.Z
```

- **main**: Production-ready only; protected; auto-deploys to Production (`ehr.uossm.us`).
- **develop**: Integration branch; protected; auto-deploys to Staging (`ehr-staging.uossm.us`).
- **feature/<...>**: New work from `develop`; merge to `develop` via PR after review.
- **hotfix/<...>**: Critical fixes from `main`; merge to both `main` and `develop`.
- **release/vX.Y.Z** (optional): Freeze for extended testing before merge to `main`.

---

## Protected Branch Rules (GitHub)

- **Shared requirements**
  - Pull requests required with ≥1 approval; dismiss stale approvals on new commits.
  - Signed commits; conversations resolved; branches up to date before merge; no direct pushes.

- **main required checks**
  - Build, tests, lint/format, TypeScript compile.
  - Database migration validation (Kysely on Postgres 16).
  - Security scans (dependency + code scanning) and secret scanning.
  - Linear history; include administrators in protections.

- **develop required checks**
  - Build, tests, lint/format, TypeScript compile.
  - Code quality checks; branches up to date.

---

## CI/CD Overview (GitHub Actions → Render)

- **Triggers**
  - PRs and pushes to `develop` → CI checks → deploy to Staging on merge.
  - PRs and pushes to `main` → CI checks → deploy to Production on merge.

- **Key jobs**
  - Install deps with pnpm; build with Vite; run Vitest tests.
  - Lint and format checks with Biome; TypeScript compilation.
  - Database migration validation against Postgres 16 service.
  - Security scanning (e.g., Trivy/CodeQL) and secret scanning.

- **Render integration**
  - Deploy hooks connect `develop` to Staging and `main` to Production.
  - `render.yaml` defines service, `NODE_VERSION`, and database connection from Render DB.

---

## Developer Workflow

1. **Create feature branch** from `develop`: `feature/<short-description>`.
2. **Develop and commit** with conventional commit messages.
3. **Open PR to `develop`**, addressing reviews and ensuring CI passes.
4. **Merge to `develop`** → auto-deploy to Staging → validate with stakeholders.
5. **Open PR from `develop` to `main`** when ready for production.
6. **Tag release** on `main` (e.g., `v1.2.3`) after deploy for auditability.

### Hotfixes
- Branch from `main` → `hotfix/<issue>` → PR to `main` (deploy) → PR to `develop` to stay in sync.

### Commit Convention
```
<type>(<scope>): <description>

feat, fix, docs, style, refactor, test, chore
```

---

## Environments

- **Staging** (`ehr-staging.uossm.us`)
  - Purpose: UAT and validation of features and migrations.
  - Data: Strictly anonymized; no PHI.
  - DB: Separate PostgreSQL instance.

- **Production** (`ehr.uossm.us`)
  - Purpose: Live patient care operations.
  - Data: PHI; HIPAA-aligned practices.
  - DB: Production PostgreSQL with backups and monitoring.

---

## Environment Variables & Secrets

- Manage sensitive values via GitHub secrets and Render environment variables.
- Never commit secrets; enable GitHub secret scanning.
- Validate environment variables during CI build step.

---

## Database Practices

- **Migrations**: Use Kysely; every schema change via migration; include safe down steps when feasible.
- **Validation**: Run migration validation in CI against Postgres 16.
- **Backups**: Enable Render/Postgres backups; encrypt; retain per policy; test restores regularly.
- **Data safety**: Avoid destructive changes; use incremental migrations; test on Staging before Production.

---

## Monitoring, Logging, and Health

- **Error tracking**: Sentry enabled (automatic in `src/router.tsx`); instrument server functions using `Sentry.startSpan` where applicable.
- **Health checks**: App route and DB connectivity checks; monitor SSL/TLS validity.
- **Performance**: Track response times and error rates; target >99.9% uptime.
- **Logs**: Structured logs for access, application, errors, and audit events.

---

## Security & Compliance

- **Branch protections** and signed commits enforce review and integrity.
- **No PHI in Staging**; use anonymized datasets and access controls.
- **Dependency and code scanning**: Address critical issues promptly.
- **Access control**: Role-based permissions in GitHub and Render; least-privilege.
- **Backups**: Encrypted at rest and in transit; documented restores.

---

## Deployment & Validation Procedures

### Staging
- Merge to `develop` → auto-deploy.
- Validate critical flows, DB migrations, and error logs.

### Production
- Merge `develop` → `main` via PR after staging sign-off.
- Tag release on `main` after deploy.
- Post-deploy validation: critical paths, migrations, SSL, Sentry.

---

## Rollback & Incident Response

- **Application rollback**: Revert offending commit(s) on `main`; redeploy.
- **Database rollback**: Use migration down where safe; otherwise restore from backup.
- **Hotfix path**: Use `hotfix/<issue>` for urgent fixes; deploy to `main` then sync to `develop`.
- **Post-incident**: Document root cause, actions, and improvements.

---

## Governance & Responsibilities

- **Code Owners/Reviewers**: Approve PRs to protected branches.
- **DevOps**: Maintain CI/CD, secrets, and Render services.
- **Security**: Monitor scans, manage access, oversee incident response.
- **Product/Clinical**: Validate staging and approve production releases.

---

## References (Detailed Source Docs)

- `docs/GIT_STRATEGY.md`
- `docs/GITHUB_BRANCH_PROTECTION.md`
- `docs/DEVELOPER_WORKFLOW.md`
- `render.yaml`

*This consolidated standard will be updated as processes evolve.*
