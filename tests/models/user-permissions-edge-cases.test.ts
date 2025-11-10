import { describe, it, expect, vi } from "vitest";

// Mock the database before importing User
vi.mock("@/db", () => ({
  default: {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    deleteFrom: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(null),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/db/db-config", () => ({
  getDatabaseConfig: () => ({
    host: "localhost",
    port: 5432,
    database: "test_db",
    user: "test_user",
    password: "test_password",
    ssl: { rejectUnauthorized: false },
  }),
}));

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_NAME = "test_db";
process.env.DB_USER = "test_user";
process.env.DB_PASSWORD = "test_password";

import User from "../../src/models/user";

describe("Provider and Registrar Permission Verification", () => {
  describe("Provider CANNOT create users", () => {
    it("should prevent provider from creating registrar", () => {
      expect(User.canCreateRole("provider", "registrar")).toBe(false);
    });

    it("should prevent provider from creating another provider", () => {
      expect(User.canCreateRole("provider", "provider")).toBe(false);
    });

    it("should prevent provider from creating admin", () => {
      expect(User.canCreateRole("provider", "admin")).toBe(false);
    });

    it("should prevent provider from creating super_admin", () => {
      expect(User.canCreateRole("provider", "super_admin")).toBe(false);
    });
  });

  describe("Registrar CANNOT create users", () => {
    it("should prevent registrar from creating another registrar", () => {
      expect(User.canCreateRole("registrar", "registrar")).toBe(false);
    });

    it("should prevent registrar from creating provider", () => {
      expect(User.canCreateRole("registrar", "provider")).toBe(false);
    });

    it("should prevent registrar from creating admin", () => {
      expect(User.canCreateRole("registrar", "admin")).toBe(false);
    });

    it("should prevent registrar from creating super_admin", () => {
      expect(User.canCreateRole("registrar", "super_admin")).toBe(false);
    });
  });

  describe("Provider CANNOT edit users VERIFIED", () => {
    it("provider CANNOT manage registrar", () => {
      const result = User.canManageRole("provider", "registrar");
      expect(result).toBe(false);
    });

    it("provider CANNOT manage another provider", () => {
      const result = User.canManageRole("provider", "provider");
      expect(result).toBe(false);
    });

    it("provider CANNOT UPDATE a registrar", () => {
      const result = User.canUpdateUser("provider", "registrar");
      expect(result).toBe(false);
    });

    it("provider CANNOT UPDATE another provider", () => {
      const result = User.canUpdateUser("provider", "provider");
      expect(result).toBe(false);
    });
  });

  describe("Registrar CANNOT edit users VERIFIED", () => {
    it("registrar CANNOT manage another registrar", () => {
      const result = User.canManageRole("registrar", "registrar");
      expect(result).toBe(false);
    });

    it("registrar CANNOT UPDATE another registrar", () => {
      const result = User.canUpdateUser("registrar", "registrar");
      expect(result).toBe(false);
    });

    it("registrar CANNOT manage any role", () => {
      expect(User.canManageRole("registrar", "registrar")).toBe(false);
      expect(User.canManageRole("registrar", "provider")).toBe(false);
      expect(User.canManageRole("registrar", "admin")).toBe(false);
      expect(User.canManageRole("registrar", "super_admin")).toBe(false);
    });
  });
});

