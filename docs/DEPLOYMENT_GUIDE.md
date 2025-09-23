# Hikma Health Server - Deployment Guide

This guide covers the complete deployment setup for the Hikma Health Server on Render with staging and production environments.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Render Configuration](#render-configuration)
- [GitHub Secrets Setup](#github-secrets-setup)
- [DNS Configuration](#dns-configuration)
- [Deployment Process](#deployment-process)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Backup & Recovery](#backup--recovery)
- [Troubleshooting](#troubleshooting)

## Prerequisites

1. **GitHub Repository**: UOSSM-USA/hikma-health-server
2. **Render Account**: With access to create services and databases
3. **Domain Management**: Access to GoDaddy & Microsoft DNS for uossm.us
4. **Sentry Account**: For error monitoring and performance tracking

## Environment Setup

### Git Branching Strategy

```
main (production)
├── develop (staging)
│   ├── feature/user-authentication
│   ├── feature/patient-management
│   └── feature/appointments
└── hotfix/critical-security-patch
```

**Branch Rules:**
- `main`: Production-ready code, protected branch
- `develop`: Staging environment, integration branch
- `feature/*`: New features, merge to develop
- `hotfix/*`: Critical fixes, can merge directly to main

### Environment Variables

#### Staging Environment
```bash
NODE_ENV=production
NODE_VERSION=22.14.0
DATABASE_URL=<from_render_database>
SERVER_URL=https://ehr-staging.uossm.us
VITE_APP_TITLE="Hikma Health (Staging)"
VITE_SENTRY_ORG=<your_sentry_org>
VITE_SENTRY_PROJECT=hikma-health-staging
SENTRY_AUTH_TOKEN=<staging_sentry_token>
ENABLE_DEBUG_FEATURES=true
ALLOW_REGISTRATION=true
```

#### Production Environment
```bash
NODE_ENV=production
NODE_VERSION=22.14.0
DATABASE_URL=<from_render_database>
SERVER_URL=https://ehr.uossm.us
VITE_APP_TITLE="Hikma Health"
VITE_SENTRY_ORG=<your_sentry_org>
VITE_SENTRY_PROJECT=hikma-health-production
SENTRY_AUTH_TOKEN=<production_sentry_token>
ENABLE_DEBUG_FEATURES=false
ALLOW_REGISTRATION=false
SESSION_SECRET=<secure_random_string>
JWT_SECRET=<secure_random_string>
```

## Render Configuration

### Step 1: Create Staging Environment

1. **Create Staging Database**
   ```bash
   # Use render-staging.yaml configuration
   # Database: hikma-health-db-staging
   # Plan: standard (minimum recommended)
   ```

2. **Create Staging Web Service**
   ```bash
   # Service: hikma-health-server-staging
   # Plan: standard
   # Branch: develop
   # Build: pnpm install && pnpm run build
   # Start: pnpm run start
   ```

### Step 2: Create Production Environment

1. **Create Production Database**
   ```bash
   # Use render-production.yaml configuration
   # Database: hikma-health-db-production
   # Plan: pro (with high availability)
   # Backup retention: 30 days
   ```

2. **Create Production Web Service**
   ```bash
   # Service: hikma-health-server-production
   # Plan: pro
   # Branch: main
   # Scaling: 2-10 instances
   # Build: pnpm install && pnpm run build
   # Start: pnpm run start
   ```

## GitHub Secrets Setup

Add the following secrets to your GitHub repository:

```bash
# Render API Configuration
RENDER_API_KEY=<your_render_api_key>
RENDER_STAGING_SERVICE_ID=<staging_service_id>
RENDER_PRODUCTION_SERVICE_ID=<production_service_id>

# Sentry Configuration
SENTRY_AUTH_TOKEN_STAGING=<staging_sentry_token>
SENTRY_AUTH_TOKEN_PRODUCTION=<production_sentry_token>
```

### How to Get Render Service IDs:
1. Go to your Render dashboard
2. Click on your service
3. Copy the service ID from the URL: `render.com/services/srv-xxxxxxxxx`

## DNS Configuration

### GoDaddy DNS Setup

1. **For Staging (ehr-staging.uossm.us):**
   ```
   Type: CNAME
   Name: ehr-staging
   Value: <staging-service-name>.onrender.com
   TTL: 1 hour
   ```

2. **For Production (ehr.uossm.us):**
   ```
   Type: CNAME
   Name: ehr
   Value: <production-service-name>.onrender.com
   TTL: 1 hour
   ```

### Microsoft DNS (if using Microsoft for subdomain management)

Follow similar CNAME setup pointing to your Render service URLs.

### TLS Certificates

Render automatically provisions Let's Encrypt certificates for custom domains. Ensure:
1. DNS is properly configured
2. Domain verification is complete
3. Certificate shows as "Active" in Render dashboard

## Deployment Process

### Staging Deployment (Automatic)

1. **Create/Update Feature Branch**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   # Make changes
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request to Develop**
   - Open PR from feature branch to `develop`
   - Wait for CI checks to pass
   - Get code review approval
   - Merge to `develop`

3. **Automatic Staging Deployment**
   - Push to `develop` triggers `deploy-staging.yml`
   - Tests run automatically
   - If tests pass, deploys to staging
   - Access at: https://ehr-staging.uossm.us

### Production Deployment

1. **Create Pull Request to Main**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b release/v1.x.x
   git merge develop
   git push origin release/v1.x.x
   ```

2. **Manual Production Deployment**
   - Option A: Push to `main` (automatic)
   - Option B: Manual trigger via GitHub Actions
     ```
     Go to Actions → Deploy to Production → Run workflow
     Enter: "DEPLOY_TO_PRODUCTION" to confirm
     ```

3. **Post-Deployment Verification**
   - Check health endpoint: https://ehr.uossm.us/api/health
   - Verify database migrations
   - Check Sentry for errors
   - Monitor application logs

## Monitoring & Health Checks

### Health Check Endpoint

The application includes a comprehensive health check at `/api/health`:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-20T10:30:00.000Z",
  "environment": "production",
  "version": "1.0.0",
  "uptime": 3600,
  "memory": {
    "rss": 52428800,
    "heapTotal": 20971520,
    "heapUsed": 18874368
  },
  "checks": {
    "server": "ok",
    "database": "ok"
  }
}
```

### Sentry Integration

Monitor errors and performance:
1. Configure Sentry projects for staging and production
2. Set up error alerts
3. Monitor performance metrics
4. Set up deployment tracking

### Render Monitoring

Use Render's built-in monitoring:
1. Service metrics (CPU, memory, response time)
2. Database metrics (connections, query performance)
3. Log aggregation and search
4. Uptime monitoring

## Backup & Recovery

### Database Backups

**Automatic Backups (Render Pro):**
- Daily automated backups
- 30-day retention (production)
- Point-in-time recovery available

**Manual Backup:**
```bash
# Export database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore database
psql $DATABASE_URL < backup_file.sql
```

### Application Backup

**Code Backup:**
- Git repository (primary backup)
- GitHub automated backups
- Local development environment

**Configuration Backup:**
- Environment variables documentation
- Render service configurations
- DNS settings documentation

### Recovery Procedures

1. **Database Recovery:**
   ```bash
   # Restore from Render backup
   # Use Render dashboard to restore from backup point
   
   # Or restore from manual backup
   psql $DATABASE_URL < backup_file.sql
   ```

2. **Application Recovery:**
   ```bash
   # Rollback deployment
   git revert <commit-hash>
   git push origin main  # Triggers automatic redeployment
   ```

3. **DNS Recovery:**
   - Update DNS records if needed
   - Wait for propagation (up to 48 hours)
   - Use DNS tools to verify changes

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Check build logs in GitHub Actions
   # Verify dependencies in package.json
   # Check Node.js version compatibility
   ```

2. **Database Connection Issues**
   ```bash
   # Verify DATABASE_URL environment variable
   # Check database service status in Render
   # Verify database credentials
   ```

3. **DNS Issues**
   ```bash
   # Check DNS propagation: dig ehr.uossm.us
   # Verify CNAME records point to correct Render URL
   # Check SSL certificate status in Render
   ```

4. **Memory Issues**
   ```bash
   # Monitor memory usage in Render dashboard
   # Consider upgrading service plan
   # Check for memory leaks in application
   ```

### Debug Commands

```bash
# Check health endpoint
curl https://ehr.uossm.us/api/health

# Check DNS resolution
dig ehr.uossm.us
nslookup ehr.uossm.us

# Check SSL certificate
openssl s_client -connect ehr.uossm.us:443 -servername ehr.uossm.us

# Check database connectivity (from local)
psql $DATABASE_URL -c "SELECT version();"
```

### Log Analysis

1. **Application Logs**
   - Access via Render dashboard
   - Filter by service and time range
   - Look for error patterns

2. **GitHub Actions Logs**
   - Check workflow runs
   - Identify failed steps
   - Review test output

3. **Sentry Error Tracking**
   - Monitor error rates
   - Track performance issues
   - Set up alerts for critical errors

## Security Considerations

### Environment Variables
- Never commit secrets to git
- Use Render's secret management
- Rotate secrets regularly
- Use different secrets for staging/production

### Database Security
- Use strong, unique passwords
- Enable SSL connections
- Regular security updates
- Monitor access logs

### Application Security
- Keep dependencies updated
- Run security audits (`pnpm audit`)
- Monitor Sentry for security-related errors
- Implement proper authentication/authorization

## Next Steps

1. **Set up monitoring dashboards**
2. **Configure backup verification**
3. **Implement automated testing**
4. **Set up performance monitoring**
5. **Create incident response procedures**

For additional support, refer to:
- [Render Documentation](https://render.com/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Sentry Documentation](https://docs.sentry.io/)
