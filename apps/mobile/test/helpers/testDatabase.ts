/**
 * Creates isolated WatermelonDB instances backed by LokiJSAdapter for
 * integration tests. Each call to `createTestDatabase()` returns a fresh,
 * empty database — no shared state between tests.
 *
 * Usage:
 *   const db = createTestDatabase()
 *   afterEach(() => resetTestDatabase(db))
 */

import { Database } from "@nozbe/watermelondb"
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs"
import logger from "@nozbe/watermelondb/utils/common/logger"
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId"
import { uuidv7 } from "uuidv7"

// Silence WatermelonDB's chatty Loki logs during tests
logger.silence()

// Mirror app/db/index.ts: production record ids are UUIDs, not WatermelonDB's
// default random ids. Code that validates an id would otherwise pass in
// production and fail here for reasons unrelated to what is under test.
setGenerator(() => uuidv7())

import { modelClasses } from "../../app/db/modelClasses"
import schema from "../../app/db/schema"

let dbCounter = 0

/** Create a fresh, isolated WatermelonDB instance for testing. */
export function createTestDatabase(): Database {
  dbCounter++
  const adapter = new LokiJSAdapter({
    schema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    dbName: `test_db_${dbCounter}_${Date.now()}`,
  })

  return new Database({
    adapter,
    modelClasses,
  })
}

/**
 * Wipe all data from a test database so it can be reused across tests
 * within the same describe block, or call in afterEach for full isolation.
 */
export async function resetTestDatabase(db: Database): Promise<void> {
  await db.write(async () => {
    await db.unsafeResetDatabase()
  })
}
