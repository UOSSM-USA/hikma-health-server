import { createAPIFileRoute } from '@tanstack/react-start/api'
import { json } from '@tanstack/react-start'

export const Route = createAPIFileRoute('/api/health')({
  GET: async () => {
    try {
      // Basic health check
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        checks: {
          server: 'ok',
          database: 'checking...'
        }
      }

      // Try to check database connection
      try {
        // Import database connection
        const { db } = await import('../../db')
        
        // Simple database check - try to execute a basic query
        await db.selectFrom('users').select('id').limit(1).execute()
        healthStatus.checks.database = 'ok'
      } catch (dbError) {
        healthStatus.checks.database = 'error'
        healthStatus.status = 'degraded'
        console.error('Database health check failed:', dbError)
      }

      return json(healthStatus, {
        status: healthStatus.status === 'healthy' ? 200 : 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    } catch (error) {
      console.error('Health check failed:', error)
      return json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }, {
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }
  }
})
