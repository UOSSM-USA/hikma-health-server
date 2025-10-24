import { describe, it, expect } from "vitest";
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

