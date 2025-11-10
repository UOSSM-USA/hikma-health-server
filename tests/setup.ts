// This file is used to set up global test configurations
// It is automatically imported by Vitest before running tests

import { vi } from "vitest";

// Mock the database config FIRST to prevent environment variable checks
// This must be mocked before @/db is imported
vi.mock("@/db/db-config", () => ({
  getDatabaseConfig: vi.fn(() => ({
    host: "localhost",
    database: "test_db",
    user: "test_user",
    password: "test_password",
    port: 5432,
    ssl: {
      rejectUnauthorized: false,
    },
  })),
  getDatabaseSSLConfig: vi.fn(() => false),
}));

// Mock the database module to prevent database connection attempts during tests
// Tests that need actual database access should override this mock
vi.mock("@/db", async () => {
  const { vi } = await import("vitest");
  return {
    default: {
      selectFrom: vi.fn(() => ({
        selectAll: vi.fn(),
        select: vi.fn(),
        where: vi.fn(),
        execute: vi.fn(),
      })),
      insertInto: vi.fn(() => ({
        values: vi.fn(),
        returning: vi.fn(),
        execute: vi.fn(),
      })),
      updateTable: vi.fn(() => ({
        set: vi.fn(),
        where: vi.fn(),
        returning: vi.fn(),
        execute: vi.fn(),
      })),
      deleteFrom: vi.fn(() => ({
        where: vi.fn(),
        returning: vi.fn(),
        execute: vi.fn(),
      })),
    },
  };
});
